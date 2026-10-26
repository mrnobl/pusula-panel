'use strict';
/**
 * KÂĞIT ACİL DURDURMAYI GERİ AL (77.5, kullanıcı 2026-10-26 — Tao acil denemesi) — YALNIZ KÂĞIT HESAP.
 * ═══════════════════════════════════════════════════════════════════════════
 * İstek: "tao'nun eski işlemlerini kaldığı yerden tekrar açmasını sağla; arada geçen sürede oluşan fiyat farkı hesaplansın ve geçmiş
 * fiyat verilerinden simüle edilsin; bugüne gelindiğinde işlemler ne durumda olacaksa hesaplasın ve devam etsin".
 *
 * YÖNTEM (yeni simülatör YOK — botun ve kâğıt borsanın KENDİ kodu):
 *   1. KAYNAK: acil ÖNCESİ durumun tam kopyası. Tercih sırası:
 *        a. `<bot dizini>/acil-oncesi/<zaman>/` — 77.5'ten sonra kâğıt acil durdurma bunu kendisi yazar (`acilOncesiKaydet`,
 *           bindirmeBot._acilDurdur'un ilk satırı); acil kaydından en çok 15 dk önce olmalı.
 *        b. GÜNLÜK YEDEK (lib/yedek.js, görev PusulaYedek 05:30): `<yedek hedefi>/<gün>/data/live/<bot>/` — manifest zamanı acilden
 *           ÖNCE ve en çok 3 gün önce olan en yenisi.
 *      Yalnız durum dosyalarının `.yedek` kopyaları KAYNAK OLAMAZ (acilin kendi yazımları ve sonraki dakikalık yazımlar onları da
 *      ezer). Kaynak, bugünkü emir defterinin (emirler.jsonl) BAŞI olmalı (aynı hesap; arada kâğıt sıfırlama yok) — değilse RED.
 *   2. SİMÜLASYON: kaynağın kopyası geçici klasörde açılır; aynı ayarla BindirmeBot + CanliYurutucu + KagitBorsa kurulur. Kâğıt
 *      borsanın verisi `GecmisVeri` (lib/live/gecmisVeri.js — genel Binance 1 dk mumları, sanal saat). Kaynak anından ŞİMDİYE
 *      kadar dakika dakika botun kendi dakikalık işi koşar (`BindirmeBot._tik`): kâğıt borsanın dolum kuralları (limit / TP / DCA
 *      basamakları; kötümser modelde koşullu emirler), DCA senkronu, saatlik marj, ve araya giren her karar saatinde (UTC 00:02)
 *      günlük karar (`gunlukCalisma` — mutabakat + kol + BTC ayağı). Acil hiç olmamış gibi: acilin kapanış işlemleri ve ücretleri
 *      kaynakta YOK.
 *   3. DOĞRULAMA (emin olunamayan durumda RED): kaynakta ve simülasyon sonunda yürütücü + kol (+ çoklu varlık) mutabakatı temiz;
 *      simülasyonun ACİL ANINDAKİ pozisyonları acilin kapattıklarıyla (kâğıt borsadaki `ag-acil-` dolumları + BTC ayağı acil satışı)
 *      %1 içinde aynı; aradaki karar saatinde karar verilmiş; bot ENGEL'siz.
 *   4. UYGULAMA (acil PIN + "GERIAL"): bot DURMUŞKEN; önizleme ≤ 30 dk eski ve kayıtlar önizlemeden beri değişmemiş olmalı.
 *      Bütün dosyalar önce `<bot dizini>/geri-al-yedek/<zaman>/` klasörüne kopyalanır; sonra durum dosyaları simülasyonun son
 *      hâliyle değiştirilir (olay günlükleri — alarmlar/marj/mutabakat/sapma/gölge/koruma/veri kalitesi — korunur, alarmlar.jsonl'e
 *      `kagit-geri-al` satırı eklenir). Sunucu botu yeniden kurar ve mutabakat yapar; temiz değilse yedek GERİ YÜKLENİR.
 * DEMO / CANLI HESAPTA KESİN KAPALI (409). Kairos'ta (hucum) bu sürümde kapalı (demo kabul 2026-12-09). Bot çalışırken 409.
 *
 * API: ONAY · engel() · acilOncesiKaydet() · sonOlaylar() · gorunurluk() · kaynakBul() · simule() · onizle() · isBaslat() ·
 *      isDurumu() · parmakIzi() · uygula() · geriYukle()
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { GecmisVeri, DK } = require('./gecmisVeri');

const ONAY = 'GERIAL';
const KAIROS = 'hucum';
const ANLIK_KLASOR = 'acil-oncesi';
const YEDEK_KLASOR = 'geri-al-yedek';
const ANLIK_SAKLA = 5;
const GUN = 864e5;
const KARAR_DK = 2;                                  // BindirmeBot._tik: UTC gün değiştikten 2 dk sonra
const ONIZLEME_OMRU = 30 * 60000;
const KAYNAK_EN_ESKI = 3 * GUN;
const ANLIK_PAYI = 15 * 60000;
const ACIL_PENCERE = 30 * 60000;                     // acil kaydından önceki bu sürede ag-acil- dolumları aranır
const TOL = 0.01;                                     // acil anı karşılaştırması: %1
const ACIL_ONEK = 'ag-acil-';
const TOZ_BTC = 0.0001;                              // ≈ birkaç USDT altı vadeli varlık acil sonrası 'BTC var' sayılmaz
/** Olay günlükleri: uygulamada KORUNUR (gerçekte olanı anlatır); simülasyonun satırları kopyalanmaz. */
const GUNLUK = new Set(['alarmlar.jsonl', 'marj.jsonl', 'mutabakat.jsonl', 'sapma.jsonl', 'golge-farklar.jsonl', 'koruma.jsonl', 'veri-kalitesi.jsonl', 'prova-gunlugu.json']);
const ATLA = /\.tmp$|\.gecici$|\.bozuk-\d+\.bak$/;
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);
const zamanEtiketi = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

// ── Dosya yardımcıları ──────────────────────────────────────────────────────
function ustDosyalar(dizin) {
  if (!dizin || !fs.existsSync(dizin)) return [];
  return fs.readdirSync(dizin, { withFileTypes: true }).filter(d => d.isFile() && !ATLA.test(d.name)).map(d => d.name).sort();
}
function jsonOku(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return null; } }
function satirlar(p) {
  if (!fs.existsSync(p)) return [];
  const out = [];
  for (const s of fs.readFileSync(p, 'utf8').split('\n')) { if (!s.trim()) continue; try { out.push(JSON.parse(s)); } catch { /* yarım satır */ } }
  return out;
}
function onekMi(kisa, uzun) {
  const a = fs.existsSync(kisa) ? fs.readFileSync(kisa) : Buffer.alloc(0);
  const b = fs.existsSync(uzun) ? fs.readFileSync(uzun) : Buffer.alloc(0);
  return a.length <= b.length && b.subarray(0, a.length).equals(a);
}
function atomikKopya(kaynak, hedef) {
  const gec = `${hedef}.${process.pid}.gecici`;
  fs.copyFileSync(kaynak, gec);
  fs.renameSync(gec, hedef);
}

// ── Kapılar ─────────────────────────────────────────────────────────────────
/** "GERIAL" — Türkçe klavyede küçük yazılırsa (gerial → GERİAL) da kabul (İ/ı → I). */
function onayDogru(v) { return String(v == null ? '' : v).trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I') === ONAY; }
/**
 * @returns null | Türkçe neden (409). `kimlik` iç ad (hucum/denge/…), `ad` görünen ad.
 */
function engel({ kimlik, ad, mod, calisiyor, dizin, kok }) {
  const g = ad || kimlik;
  if (mod !== 'kagit') return `${g} kâğıt hesapta değil (hesap türü: ${mod === 'demo' ? 'demo' : mod === 'canli' ? 'canlı hesap' : mod}) — acil durdurmayı geri alma YALNIZ kâğıt hesapta; demo ve canlı hesapta kapalı.`;
  if (kimlik === KAIROS) return `${g}: bu sürümde kapalı — Kairos'un kayıtlarına demo kabul süresince (2026-12-09'a kadar) bu araç dokunmaz.`;
  if (calisiyor) return `${g} çalışıyor — önce botu durdurun, sonra acil durdurmayı geri alın.`;
  const ad2 = path.basename(String(dizin || ''));
  if (!dizin || /-(demo|canli)$/.test(ad2) || /-onceki-/.test(ad2)) return `bu dizin kâğıt hesap dizini değil (${ad2 || '—'}) — geri alınmadı.`;
  if (kok) {
    const r = path.relative(path.resolve(kok), path.resolve(dizin));
    if (!r || r.startsWith('..') || path.isAbsolute(r) || r.includes(path.sep)) return `bot dizini veri yerinin dışında (${ad2}) — geri alınmadı.`;
  }
  return null;
}

// ── 5. Acil öncesi anlık görüntü (bindirmeBot._acilDurdur, yalnız kâğıt) ──
/**
 * Bot dizinindeki bütün üst düzey dosyaları `<dizin>/acil-oncesi/<zaman>/` klasörüne kopyalar (+ meta.json). Son ANLIK_SAKLA kopya
 * tutulur. Emir göndermez, durum değiştirmez; hata çağırana atılır (çağıran yutar — acil ASLA bu yüzden durmaz).
 */
function acilOncesiKaydet(dizin, { sebep = null, simdi = Date.now() } = {}) {
  if (!dizin || !fs.existsSync(dizin)) return null;
  const kok = path.join(dizin, ANLIK_KLASOR);
  fs.mkdirSync(kok, { recursive: true });
  let hedef = path.join(kok, zamanEtiketi(simdi)), n = 2;
  while (fs.existsSync(hedef)) hedef = path.join(kok, `${zamanEtiketi(simdi)}-${n++}`);
  const gec = `${hedef}.yaziliyor`;
  fs.rmSync(gec, { recursive: true, force: true });
  fs.mkdirSync(gec, { recursive: true });
  const dosyalar = [];
  for (const ad of ustDosyalar(dizin)) { fs.copyFileSync(path.join(dizin, ad), path.join(gec, ad)); dosyalar.push({ ad, boyut: fs.statSync(path.join(gec, ad)).size }); }
  fs.writeFileSync(path.join(gec, 'meta.json'), JSON.stringify({ zaman: simdi, sebep: sebep == null ? null : String(sebep).slice(0, 200), dosyalar }, null, 1), 'utf8');
  fs.renameSync(gec, hedef);
  const eski = fs.readdirSync(kok).filter(a => /^\d{8}T\d{6}Z(-\d+)?$/.test(a)).sort();
  for (const a of eski.slice(0, Math.max(0, eski.length - ANLIK_SAKLA))) fs.rmSync(path.join(kok, a), { recursive: true, force: true });
  return hedef;
}

// ── Olaylar ve görünürlük ───────────────────────────────────────────────────
/**
 * alarmlar.jsonl: geri alınacak acil durdurma ve (varsa) ondan sonraki geri alma. Hedef = bir şey kapatmış (kapatilan > 0) SON acil;
 * ondan sonra gelen BOŞ aciller (0 emir / 0 pozisyon — ör. Tao 2026-10-26 10:48 ikinci acil) yok sayılır, `bosAcil` sayısında döner.
 * Hiçbiri bir şey kapatmamışsa son acil (BTC ayağının tek başına satışı olabilir — doğrulama kâğıt borsa kaydından).
 */
function sonOlaylar(dizin) {
  let acil = null, son = null, geriAl = null, bosAcil = 0;
  for (const x of satirlar(path.join(dizin, 'alarmlar.jsonl'))) {
    if (x.olay === 'acil-durdurma' && Number.isFinite(x.zaman)) { son = x; if ((+x.kapatilan || 0) > 0) { acil = x; bosAcil = 0; } else bosAcil++; }
    else if (x.olay === 'kagit-geri-al' && Number.isFinite(x.zaman)) geriAl = x;
  }
  if (!acil) { acil = son; bosAcil = 0; }
  if (geriAl && acil && geriAl.zaman < acil.zaman) geriAl = null;
  return { acil, geriAl, bosAcil };
}

/** Kâğıt borsadaki acil kapanış dolumları (ag-acil-), acilden önceki pozisyon + giriş fiyatı (gerçekleşen K/Z'den). */
function acilDolumlari(kagit, acilZaman) {
  const l = ((kagit && kagit.islemler) || []).filter(x => typeof x.clientOrderId === 'string' && x.clientOrderId.startsWith(ACIL_ONEK)
    && x.timestamp >= acilZaman - ACIL_PENCERE && x.timestamp <= acilZaman + 60000);
  return l.map(x => {
    const q = +x.amount || 0, f = +x.price || 0, kz = +((x.info && x.info.realizedPnl) || 0);
    const isaret = x.side === 'sell' ? 1 : -1;                    // satışla kapanan = LONG idi
    const giris = q > 0 ? f - kz / (q * isaret) : null;
    return { symbol: x.symbol, miktar: isaret * q, giris, kapanis: f, kz, ucret: +((x.fee && x.fee.cost) || 0), zaman: x.timestamp };
  });
}

/** BTC ayağının acil satışı (bindirme-bot.json btcIslemler, sebep "acil (…)"). */
function acilBtc(bd, acilZaman) {
  const l = ((bd && bd.btcIslemler) || []).filter(x => /^acil \(/.test(String(x.sebep || '')) && x.zaman >= acilZaman - ACIL_PENCERE && x.zaman <= acilZaman + 60000);
  if (!l.length) return null;
  const miktar = l.reduce((a, x) => a + (+x.miktar || 0), 0);
  return { miktar, fiyat: l.reduce((a, x) => a + (+x.miktar || 0) * (+x.fiyat || 0), 0) / (miktar || 1), ucret: l.reduce((a, x) => a + (+x.ucret || 0), 0), zaman: l[0].zaman };
}

/** "Son olay acil durdurma mı" — acilden sonra hesapta bir şey olduysa geri alma anlamsız (ve tehlikeli). */
function acilSonrasiSorunlar(dizin, acil, geriAl) {
  const s = [];
  if (geriAl) s.push(`bu acil durdurma ${new Date(geriAl.zaman).toISOString().slice(0, 16).replace('T', ' ')} UTC'de zaten geri alındı`);
  const bd = jsonOku(path.join(dizin, 'bindirme-bot.json')) || {};
  if (Number.isFinite(bd.sonCalisma) && bd.sonCalisma > acil.zaman) s.push(`acilden sonra günlük çalışma yapılmış (${new Date(bd.sonCalisma).toISOString().slice(0, 16).replace('T', ' ')} UTC) — bot pozisyonları kendisi yeniden kurdu`);
  const kb = jsonOku(path.join(dizin, 'kagit-borsa.json'));
  if (!kb) { s.push('kâğıt borsa dosyası (kagit-borsa.json) okunamadı'); return s; }
  const poz = Object.entries(kb.pozisyonlar || {}).filter(([, p]) => Math.abs(+p.miktar || 0) > 1e-12);
  if (poz.length) s.push(`kâğıt hesapta açık pozisyon var (${poz.map(([x]) => x.split('/')[0]).join(', ')})`);
  const acik = (kb.emirler || []).filter(o => o.status === 'open');
  if (acik.length) s.push(`kâğıt hesapta ${acik.length} açık emir var`);
  const btc = Object.entries(kb.varliklar || {}).filter(([, q]) => +q > TOZ_BTC);   // acil satışından kalan toz (ör. 0,00000991 BTC) sayılmaz
  if (btc.length) s.push(`vadeli cüzdanda ${btc.map(([v, q]) => `${q} ${v}`).join(', ')} var`);
  const sonra = (kb.islemler || []).filter(x => x.timestamp > acil.zaman + 60000 && !(typeof x.clientOrderId === 'string' && x.clientOrderId.startsWith(ACIL_ONEK)));
  if (sonra.length) s.push(`acilden sonra ${sonra.length} işlem dolmuş`);
  return s;
}

/** Panel düğmesi: yalnız kâğıt + Kairos değil + son olay acil durdurma. Hafif (ağ yok, dosya okuma). */
function gorunurluk({ kimlik, mod, dizin, calisiyor }) {
  const out = { gorunur: false, neden: null, acil: null, calisiyor: !!calisiyor, is: isDurumu(dizin) };
  if (mod !== 'kagit') { out.neden = 'yalnız kâğıt hesapta'; return out; }
  if (kimlik === KAIROS) { out.neden = 'Kairos\'ta bu sürümde kapalı'; return out; }
  try {
    const { acil, geriAl } = sonOlaylar(dizin);
    if (!acil) { out.neden = 'acil durdurma kaydı yok'; return out; }
    out.acil = { zaman: acil.zaman, sebep: acil.sebep || null, kapatilan: acil.kapatilan || 0 };
    const s = acilSonrasiSorunlar(dizin, acil, geriAl);
    if (s.length) { out.neden = s.join(' · '); return out; }
    out.gorunur = true;
  } catch (e) { out.neden = `okunamadı: ${e.message}`; }
  return out;
}

// ── Kaynak ──────────────────────────────────────────────────────────────────
function yedekHedefi() {
  try { const a = jsonOku(require('../yollar').veri('yedek-ayar.json')); if (a && a.hedef) return a.hedef; } catch { /* */ }
  return path.join(os.homedir(), 'PusulaYedek');
}

/** Kaynak adayının bugünkü dizinle uyumu (aynı hesap, aynı defter). @returns null | neden */
function kaynakUyumu(klasor, dizin) {
  if (!fs.existsSync(path.join(klasor, 'kagit-borsa.json')) || !jsonOku(path.join(klasor, 'kagit-borsa.json'))) return 'kaynakta kâğıt borsa dosyası yok/okunamıyor';
  if (!jsonOku(path.join(klasor, 'bindirme-bot.json'))) return 'kaynakta bot durum dosyası (bindirme-bot.json) yok/okunamıyor';
  if (!onekMi(path.join(klasor, 'emirler.jsonl'), path.join(dizin, 'emirler.jsonl'))) return 'kaynağın emir defteri bugünkü defterin başı değil (arada kâğıt hesap sıfırlanmış ya da başka hesap)';
  return null;
}

/**
 * @returns {{ kaynak: { tur, klasor, zaman, aciklama } | null, adaylar: [{ tur, klasor, zaman, red }], neden }}
 */
function kaynakBul({ dizin, acilZaman, yedekHedef = yedekHedefi() }) {
  const adaylar = [];
  const ak = path.join(dizin, ANLIK_KLASOR);
  if (fs.existsSync(ak)) {
    for (const a of fs.readdirSync(ak).filter(x => /^\d{8}T\d{6}Z(-\d+)?$/.test(x)).sort()) {
      const k = path.join(ak, a), m = jsonOku(path.join(k, 'meta.json'));
      if (!m || !Number.isFinite(m.zaman)) { adaylar.push({ tur: 'acil-oncesi', klasor: k, zaman: null, red: 'meta.json okunamadı' }); continue; }
      let red = null;
      if (m.zaman > acilZaman) red = 'acil kaydından sonra';
      else if (acilZaman - m.zaman > ANLIK_PAYI) red = 'bu acilin anlık görüntüsü değil (daha eski)';
      else red = kaynakUyumu(k, dizin);
      adaylar.push({ tur: 'acil-oncesi', klasor: k, zaman: m.zaman, red });
    }
  }
  if (yedekHedef && fs.existsSync(yedekHedef)) {
    for (const g of fs.readdirSync(yedekHedef).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
      const k = path.join(yedekHedef, g, 'data', 'live', path.basename(dizin));
      if (!fs.existsSync(k)) continue;
      const m = jsonOku(path.join(yedekHedef, g, 'yedek-manifest.json'));
      const z = m && Date.parse(m.zaman);
      let red = null;
      if (!Number.isFinite(z)) red = 'yedek-manifest.json okunamadı';
      else if (z >= acilZaman) red = 'acilden sonra alınmış';
      else if (acilZaman - z > KAYNAK_EN_ESKI) red = 'acilden 3 günden eski';
      else red = kaynakUyumu(k, dizin);
      adaylar.push({ tur: 'gunluk-yedek', klasor: k, zaman: Number.isFinite(z) ? z : null, red });
    }
  }
  const uygun = (t) => adaylar.filter(a => a.tur === t && !a.red).sort((a, b) => b.zaman - a.zaman)[0] || null;
  const sec = uygun('acil-oncesi') || uygun('gunluk-yedek');
  const aciklama = (a) => (a.tur === 'acil-oncesi' ? 'acil durdurmanın kendi yazdığı anlık görüntü (acilden hemen önce)' : `günlük yedek (${gunStr(a.zaman)} ${new Date(a.zaman).toISOString().slice(11, 16)} UTC — lib/yedek.js)`);
  return { kaynak: sec ? { ...sec, aciklama: aciklama(sec) } : null, adaylar,
    neden: sec ? null : `acil öncesi durumu tutan kaynak bulunamadı (bot klasöründe ${ANLIK_KLASOR}/ yok ya da uymuyor; günlük yedek: ${yedekHedef || '—'}${adaylar.length ? ` — adaylar: ${adaylar.map(a => `${a.tur} ${a.zaman ? new Date(a.zaman).toISOString().slice(0, 16) : '?'}: ${a.red}`).join(' · ')}` : ' — aday yok'})` };
}

// ── Değerleme yardımcıları ──────────────────────────────────────────────────
/** Kâğıt borsa dosyasının (ya da nesnesinin) hesap değeri: cüzdan + gerçekleşmemiş + vadeli/spot varlıklar + spot USDT. */
function kagitDeger(kb, fiyat) {
  let d = +kb.bakiye || 0;
  for (const [s, p] of Object.entries(kb.pozisyonlar || {})) { const f = fiyat(s); if (f > 0) d += (+p.miktar || 0) * (f - (+p.giris || 0)); }
  for (const [v, q] of Object.entries(kb.varliklar || {})) { const f = fiyat(`${v}/USDT:USDT`); if (f > 0) d += (+q || 0) * f; }
  for (const [v, q] of Object.entries(kb.spotCuzdan || {})) { if (v === 'USDT') d += +q || 0; else { const f = fiyat(`${v}/USDT:USDT`); if (f > 0) d += (+q || 0) * f; } }
  return d;
}
const yuvarla = (x, n = 8) => (Number.isFinite(x) ? +x.toFixed(n) : x);

/** Sıradaki karar anı (UTC gün başı + 2 dk) — t'den SONRA ilk. */
function sonrakiKarar(t) { const g = Math.floor(t / GUN) * GUN + KARAR_DK * 60000; return g > t ? g : g + GUN; }

// ── 2. Simülasyon ───────────────────────────────────────────────────────────
/**
 * Kaynağı `calisma` klasörüne kopyalar, botu orada kurar ve [t0, tSon] aralığını dakika dakika botun kendi `_tik`'iyle yürütür.
 * @param o.kaynak    { klasor, tur }
 * @param o.calisma   geçici klasör (silinip yeniden kurulur)
 * @param o.botAyar   gerçek botun ayarı (BindirmeBot.ayar; sermayeTavani = ayarlı taban)
 * @param o.yAyar     gerçek yürütücünün ayarı (CanliYurutucu.ayar)
 * @param o.temelVeri anahtarsız ccxt binanceusdm (ya da sahte)
 * @param o.t0, o.tSon, o.acilBas (ms)
 * @returns { bot, y, kb, gv, olaylar, kararlar, acilAni, hatalar, gunluk, adim }
 */
async function simule(o) {
  const { KagitBorsa } = require('./kagitBorsa');
  const { CanliYurutucu } = require('./yurutucu');
  const { BindirmeBot } = require('./bindirmeBot');
  const { calisma, kaynak, t0, tSon } = o;
  const ilerleme = o.ilerleme || (() => {});
  fs.rmSync(calisma, { recursive: true, force: true });
  fs.mkdirSync(calisma, { recursive: true });
  for (const ad of ustDosyalar(kaynak.klasor)) if (!(kaynak.tur === 'acil-oncesi' && ad === 'meta.json')) fs.copyFileSync(path.join(kaynak.klasor, ad), path.join(calisma, ad));
  // Günlük yedek dosyayı çalışırken kopyalamış olabilir: emir defterinin son satırı yarımsa satır sonu eklenir (defter yarım satırı atlar).
  const ed = path.join(calisma, 'emirler.jsonl');
  if (fs.existsSync(ed) && fs.statSync(ed).size && !fs.readFileSync(ed).subarray(-1).equals(Buffer.from('\n'))) fs.appendFileSync(ed, '\n');

  const gunluk = [], hatalar = [];
  const kaydet = (seviye, metin) => { gunluk.push({ seviye, metin: String(metin).slice(0, 300) }); if (gunluk.length > 400) gunluk.shift(); if (seviye === 'ERROR') hatalar.push(String(metin).slice(0, 300)); };
  const saat = { t: t0 };
  const gv = new GecmisVeri(o.temelVeri, () => saat.t, { bas: t0 - 10 * DK, bit: tSon });
  const kb = new KagitBorsa({ veri: gv, dosya: path.join(calisma, 'kagit-borsa.json'), model: 'kotumser' });
  // OLAY YAKALAMA — yalnız bu (simülasyon) nesnesinde; kâğıt borsa sınıfı değişmez.
  const olaylar = [];
  const asilDoldur = kb._doldur.bind(kb);
  kb._doldur = (em, fiyat, tur) => {
    const once = +em.filled || 0;
    asilDoldur(em, fiyat, tur);
    const q = (+em.filled || 0) - once;
    if (q > 0) olaylar.push({ t: saat.t, tur: 'dolum', symbol: em.symbol, side: em.side, miktar: yuvarla(q), fiyat: yuvarla(fiyat), emir: em.type === 'market' ? 'piyasa' : 'limit', azaltan: !!em.reduceOnly, cid: em.clientOrderId || null });
  };
  const asilSpotDoldur = kb._spotDoldur.bind(kb);
  kb._spotDoldur = (...a) => { const r = asilSpotDoldur(...a); olaylar.push({ t: saat.t, tur: 'spot', symbol: `${a[2]}/USDT (spot)`, side: a[1] === 'BUY' ? 'buy' : 'sell', miktar: yuvarla(a[3]), fiyat: yuvarla(a[4]) }); return r; };
  const asilSpotEmir = kb.spotEmir.bind(kb);
  kb.spotEmir = async (...a) => { const r = await asilSpotEmir(...a); olaylar.push({ t: saat.t, tur: 'spot', symbol: `${a[0]}/USDT (spot)`, side: a[1], miktar: yuvarla(r.amount), fiyat: yuvarla(r.average) }); return r; };

  const y = new CanliYurutucu({ ...(o.yAyar || {}), dizin: calisma, kaydet: (s, m) => kaydet(s, `borsa: ${m}`), simdi: () => saat.t, uyu: async () => {} });
  // Simülasyon defteri: satır fsync'siz eklenir (sonuç aynı; dakikalık sorgularda binlerce fsync olmasın) ve zaman alanları sanal saatte.
  if (y.defter.dosya) {
    const d = y.defter;
    d._yaz = (k) => { if (k && 'guncelleme' in k) k.guncelleme = saat.t; if (k && k.tur === 'sayac') k.zaman = saat.t; fs.appendFileSync(d.dosya, JSON.stringify(k) + '\n', 'utf8'); };
  }
  const bot = new BindirmeBot(y, { ...(o.botAyar || {}), dizin: calisma, kaydet, bildirici: null, saglik: null, veriKalitesi: null, kapiFn: null,
    riskKapisiFn: null, hesapKesicisi: null, paraAkisOnay: false, uyu: async () => {} });
  const temizle = () => { try { if (bot.cv) bot.cv.birak(); } catch { /* */ } };
  if (bot.durum.engel && /durum dosyası bozuk/.test(bot.durum.engel)) { temizle(); throw new Error(`kaynak durum dosyası bozuk: ${bot.durum.engel}`); }

  await y.baglanKagit(kb);
  if (y.durum !== 'AKTIF') { temizle(); throw new Error(`kaynakta yürütücü mutabakatı temiz değil: ${y.durmaSebebi}`); }
  const m0 = await bot.mutabakat({ kaynak: 'geri-al' });
  if (m0.engel) { temizle(); throw new Error(`kaynakta kol mutabakatı temiz değil: ${m0.engel}`); }
  const sonGunBas = bot.durum.sonGun;

  bot.durum.calisiyor = true;                      // zamanlayıcı KURULMAZ — dakikalar aşağıda elle
  const kararlar = [];
  let acilAni = null;
  const ilk = Math.floor(t0 / DK) * DK + DK, son = Math.floor(tSon / DK) * DK;
  const toplam = Math.max(1, Math.round((son - ilk) / DK) + 1);
  let adim = 0;
  for (let t = ilk; t <= son; t += DK) {
    if (!acilAni && o.acilBas != null && t > o.acilBas) {
      saat.t = t - DK;
      acilAni = { t: t - DK, pozisyonlar: Object.fromEntries(Object.entries(kb.pozisyonlar).map(([s, p]) => [s, { miktar: p.miktar, giris: p.giris }])), btc: bot.cv ? (await bot.cv.btcToplam()).toplam : +(kb.varliklar[bot.ayar.varlik] || 0), ozsermaye: await bot._ozsermaye() };
    }
    saat.t = t;
    const gercekBas = Date.now();
    const sonGunOnce = bot.durum.sonGun;
    await bot._tik(t);
    // Kâğıt borsanın kayıt zamanları gerçek saatle yazıldı → bu dakikanın kayıtları sanal saate çekilir (yalnız simülasyon kopyası).
    for (const x of kb.islemler) if (x.timestamp >= gercekBas) x.timestamp = t;
    for (const x of kb.emirler.values()) { if (x.timestamp >= gercekBas) x.timestamp = t; if (x.lastTradeTimestamp >= gercekBas) x.lastTradeTimestamp = t; }
    for (const x of kb.spotIslemler) if (x.timestamp >= gercekBas) x.timestamp = t;
    for (const x of kb.spotEmirler) if (x.transactTime >= gercekBas) x.transactTime = t;
    for (const x of kb.aktarimlar) if (x.timestamp >= gercekBas) x.timestamp = t;
    if (bot.durum.sonGun !== sonGunOnce) {
      const r = bot.durum.sonRapor || {};
      kararlar.push({ t, gun: bot.durum.sonGun, rejimIcerde: !!(r.rejim && r.rejim.icerde), btcSebep: (r.btc && r.btc.sebep) || null,
        btcIslem: r.btc && r.btc.islem ? { yon: r.btc.islem.yon, miktar: yuvarla(r.btc.islem.miktar), fiyat: yuvarla(r.btc.islem.fiyat) } : null,
        kolEmir: r.kol && r.kol.yurutme ? { donchian: r.kol.yurutme.donchian, dca: r.kol.yurutme.dca, dcaKapanan: r.kol.yurutme.dcaKapanan } : null,
        ozsermaye: r.ozsermaye ? yuvarla(r.ozsermaye.sonra, 2) : null, hatalar: (r.kol && r.kol.yurutme && r.kol.yurutme.hatalar) || [] });
    }
    adim++;
    if (adim % 30 === 0 || t === son) ilerleme({ adim, toplam, t });
  }
  kb._kaydet();
  // Son mutabakat (yürütücü + kol + çoklu varlık) — temiz olmalı.
  await y.mutabakat();
  const mSon = await bot.mutabakat({ kaynak: 'geri-al' });
  bot.durum.calisiyor = false; bot._yaz();
  if (bot.kol.durum.calisiyor) { bot.kol.durum.calisiyor = false; bot.kol._yaz(); }
  temizle();
  return { bot, y, kb, gv, saat, olaylar, kararlar, acilAni, hatalar, gunluk, mutabakatSon: mSon, yurutucuSon: y.durum, sonGunBas, ilk, son };
}

// ── Önizleme ────────────────────────────────────────────────────────────────
/**
 * @param o { kimlik, ad, mod, dizin, kok, calisiyor, botAyar, yAyar, temelVeri, simdi, yedekHedef, calisma, ilerleme }
 * @returns sonuç (uygulanabilir + redler + uyarılar + tablolar). Hata atmaz (beklenmeyen hata → red).
 */
async function onizle(o) {
  const bas = Date.now();
  const simdi = o.simdi != null ? o.simdi : Date.now();
  const out = { uygulanabilir: false, redler: [], uyarilar: [], simdi, kimlik: o.kimlik, ad: o.ad || o.kimlik };
  const e = engel(o);
  if (e) { out.redler.push(e); return out; }
  const { acil, geriAl, bosAcil } = sonOlaylar(o.dizin);
  if (!acil) { out.redler.push('acil durdurma kaydı yok (alarmlar.jsonl)'); return out; }
  if (bosAcil) out.uyarilar.push(`bu acilden sonraki ${bosAcil} acil durdurma hiçbir şey kapatmamış (0 pozisyon) — yok sayıldı; geri alınan: ${new Date(acil.zaman).toISOString().slice(0, 19).replace('T', ' ')} UTC`);
  const sorun = acilSonrasiSorunlar(o.dizin, acil, geriAl);
  if (sorun.length) { out.redler.push(...sorun); return out; }
  const simdiKagit = jsonOku(path.join(o.dizin, 'kagit-borsa.json'));
  const bdSimdi = jsonOku(path.join(o.dizin, 'bindirme-bot.json')) || {};
  const kapatilan = acilDolumlari(simdiKagit, acil.zaman);
  const btcSatis = acilBtc(bdSimdi, acil.zaman);
  out.acil = { zaman: acil.zaman, sebep: acil.sebep || null, kapatilan: kapatilan.map(x => ({ ...x, miktar: yuvarla(x.miktar), giris: yuvarla(x.giris), kapanis: yuvarla(x.kapanis), kz: yuvarla(x.kz, 4), ucret: yuvarla(x.ucret, 4) })),
    btc: btcSatis, kayitKapatilan: acil.kapatilan || 0 };
  if (!kapatilan.length && !btcSatis) { out.redler.push(`acilin kapanış işlemleri kâğıt borsa kaydında bulunamadı (acil kaydı: ${acil.kapatilan || 0} pozisyon) — acil öncesi doğrulanamıyor`); return out; }
  const acilBas = Math.min(...kapatilan.map(x => x.zaman).concat(btcSatis ? [btcSatis.zaman] : []), acil.zaman) - 1000;

  const kb = kaynakBul({ dizin: o.dizin, acilZaman: acil.zaman, yedekHedef: o.yedekHedef });
  out.kaynakAdaylari = kb.adaylar.map(a => ({ tur: a.tur, zaman: a.zaman, red: a.red, klasor: a.klasor }));
  if (!kb.kaynak) { out.redler.push(kb.neden); return out; }
  out.kaynak = { tur: kb.kaynak.tur, klasor: kb.kaynak.klasor, zaman: kb.kaynak.zaman, aciklama: kb.kaynak.aciklama };
  const t0 = kb.kaynak.zaman;
  out.aralik = { bas: t0, acilBas, son: simdi, dakika: Math.round((simdi - t0) / DK) };
  const t0Karar = sonrakiKarar(t0);
  out.aralik.kararSaatleri = [];
  for (let k = t0Karar; k <= simdi; k += GUN) out.aralik.kararSaatleri.push(k);
  if (new Date(t0).getUTCMonth() !== new Date(simdi).getUTCMonth()) out.uyarilar.push('aralık ay dönümünü geçiyor: yeni ayın coin sepeti ön seçimi bugünkü 24 saatlik hacimle yapılır (geçmiş hacim yok)');

  let s;
  try {
    s = await simule({ kaynak: kb.kaynak, calisma: o.calisma, botAyar: o.botAyar, yAyar: o.yAyar, temelVeri: o.temelVeri, t0, tSon: simdi, acilBas, ilerleme: o.ilerleme });
  } catch (err) { out.redler.push(`simülasyon kurulamadı / tamamlanamadı: ${err.message}`); return out; }
  out.calisma = o.calisma;

  // 3. Doğrulamalar
  const pazar = (x) => (s.kb.markets[x] && s.kb.markets[x].precision && s.kb.markets[x].precision.amount) || 0;
  const karsi = [];
  const acilQ = {};
  for (const x of kapatilan) acilQ[x.symbol] = (acilQ[x.symbol] || 0) + x.miktar;
  const simQ = s.acilAni ? Object.fromEntries(Object.entries(s.acilAni.pozisyonlar).map(([k, p]) => [k, p.miktar])) : {};
  for (const sy of new Set([...Object.keys(acilQ), ...Object.keys(simQ)])) {
    const a = acilQ[sy] || 0, b = simQ[sy] || 0;
    const tol = Math.max(pazar(sy) * 1.01, Math.abs(a) * TOL, 1e-9);
    const g = (s.acilAni && s.acilAni.pozisyonlar[sy]) || null;
    karsi.push({ symbol: sy, acil: yuvarla(a), simulasyon: yuvarla(b), giris: g ? yuvarla(g.giris) : null, uyumlu: Math.abs(a - b) <= tol });
  }
  const btcA = btcSatis ? btcSatis.miktar : 0, btcS = s.acilAni ? s.acilAni.btc : 0;
  const btcUyum = Math.abs(btcA - btcS) <= Math.max(0.00002, Math.abs(btcA) * TOL);
  out.acilAni = { t: s.acilAni ? s.acilAni.t : null, karsilastirma: karsi, btc: { acil: yuvarla(btcA), simulasyon: yuvarla(btcS), uyumlu: btcUyum }, ozsermaye: s.acilAni ? yuvarla(s.acilAni.ozsermaye, 2) : null };
  if (!s.acilAni) out.redler.push('simülasyon acil anına ulaşmadı');
  const uyumsuz = karsi.filter(x => !x.uyumlu);
  if (uyumsuz.length) out.redler.push(`acil anında simülasyonun pozisyonları acilin kapattıklarıyla uyuşmuyor (%1'den fazla): ${uyumsuz.map(x => `${x.symbol.split('/')[0]} acil ${x.acil} ≠ sim ${x.simulasyon}`).join(' · ')}`);
  if (!btcUyum) out.redler.push(`acil anında BTC ayağı uyuşmuyor: acilde satılan ${yuvarla(btcA)} ≠ simülasyon ${yuvarla(btcS)}`);
  if (s.yurutucuSon !== 'AKTIF') out.redler.push(`simülasyon sonunda yürütücü ${s.yurutucuSon}`);
  if (s.mutabakatSon && s.mutabakatSon.engel) out.redler.push(`simülasyon sonunda mutabakat temiz değil: ${s.mutabakatSon.engel}`);
  const engelSon = s.bot.durum.engel || s.bot.kol.durum.engel;
  if (engelSon) out.redler.push(`simülasyon sonunda bot ENGEL'de: ${engelSon}`);
  const sonKararGunu = gunStr(Math.floor((simdi - KARAR_DK * 60000) / GUN) * GUN - GUN);
  if (out.aralik.kararSaatleri.length && !(s.bot.durum.sonGun >= sonKararGunu)) out.redler.push(`aradaki karar saatinde günlük karar verilemedi (son karar günü ${s.bot.durum.sonGun || '—'}, beklenen ${sonKararGunu}): ${s.hatalar.slice(-2).join(' · ') || 'sebep günlükte'}`);
  if (s.hatalar.length) out.uyarilar.push(`simülasyon günlüğünde ${s.hatalar.length} hata satırı (son: ${s.hatalar.slice(-1)[0]})`);
  const bos = Object.entries(s.gv.bosluklar).filter(([, n]) => n > 0);
  if (bos.length) out.uyarilar.push(`1 dk veride eksik dakika: ${bos.map(([k, n]) => `${k.split('/')[0]} ${n}`).join(', ')} (o dakikalarda dolum denetlenemedi)`);
  out.uyarilar.push('kâğıt yaklaşımları aynen: işaret fiyatı yerine 1 dk kapanışı, funding yok (kâğıt hesap funding içermez)');

  // Tablolar
  const fiyat = (sy) => s.gv.fiyat(sy, simdi);
  out.olaylar = s.olaylar.filter(x => x.t >= acilBas).slice(0, 300).map(x => ({ ...x, zaman: new Date(x.t).toISOString() }));
  out.olaySayisi = { acilOncesi: s.olaylar.filter(x => x.t < acilBas).length, acilSonrasi: s.olaylar.filter(x => x.t >= acilBas).length };
  out.kararlar = s.kararlar.map(k => ({ ...k, zaman: new Date(k.t).toISOString() }));
  out.son = { pozisyonlar: Object.entries(s.kb.pozisyonlar).map(([sy, p]) => { const f = fiyat(sy); return { symbol: sy, miktar: yuvarla(p.miktar), giris: yuvarla(p.giris), fiyat: yuvarla(f), kz: f > 0 ? yuvarla(p.miktar * (f - p.giris), 2) : null }; }),
    btc: { miktar: s.bot.cv ? yuvarla((await s.bot.cv.btcToplam()).toplam) : yuvarla(+(s.kb.varliklar[s.bot.ayar.varlik] || 0)), fiyat: yuvarla(fiyat(s.bot.btcSembol)) },
    acikEmir: [...s.kb.emirler.values()].filter(x => x.status === 'open').length, sonGun: s.bot.durum.sonGun, nakit: yuvarla(s.kb.bakiye, 2) };
  const degerSimdi = simdiKagit ? kagitDeger(simdiKagit, fiyat) : null;
  let degerSon = null;
  try { degerSon = await s.bot._ozsermaye(); } catch { degerSon = kagitDeger(s.kb, fiyat); }
  out.deger = { simdi: yuvarla(degerSimdi, 2), acilAni: out.acilAni.ozsermaye, sonra: yuvarla(degerSon, 2), fark: degerSimdi != null && degerSon != null ? yuvarla(degerSon - degerSimdi, 2) : null };
  out.veri = { istek: s.gv.istekSayisi };
  out.gunlukSon = s.gunluk.slice(-40);
  out.sureMs = Date.now() - bas;
  out.uygulanabilir = out.redler.length === 0;
  return out;
}

// ── Parmak izi (önizleme ↔ uygulama arası değişmedi mi) ─────────────────────
function parmakIzi(dizin) {
  const kb = jsonOku(path.join(dizin, 'kagit-borsa.json')) || {};
  const bd = jsonOku(path.join(dizin, 'bindirme-bot.json')) || {};
  const ed = path.join(dizin, 'emirler.jsonl');
  const { acil } = sonOlaylar(dizin);
  const o = { bakiye: kb.bakiye, pozisyonlar: kb.pozisyonlar || {}, varliklar: kb.varliklar || {}, spotCuzdan: kb.spotCuzdan || {},
    acikEmir: (kb.emirler || []).filter(x => x.status === 'open').map(x => x.id).sort(), islem: (kb.islemler || []).length,
    defter: fs.existsSync(ed) ? fs.statSync(ed).size : 0, sonGun: bd.sonGun || null, sonCalisma: bd.sonCalisma || null, acil: acil ? acil.zaman : null };
  return crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
}

// ── İş kaydı (önizleme arka planda — dakikalar sürebilir) ───────────────────
const ISLER = new Map();   // dizin → iş
function isGorunum(i) {
  if (!i) return null;
  return { kimlik: i.kimlik, durum: i.durum, bas: i.bas, bitis: i.bitis || null, ilerleme: i.ilerleme || null, hata: i.hata || null, sonuc: i.sonuc || null };
}
function isDurumu(dizin) { return isGorunum(ISLER.get(dizin)); }

/**
 * Önizlemeyi arka planda başlatır (aynı bot için süren iş varsa onu döndürür). Kapı (engel) burada da denetlenir → hata kod 409.
 * @param o onizle() parametreleri + temelVeriFn (() → ccxt genel istemci)
 */
function isBaslat(o) {
  const e = engel(o);
  if (e) throw Object.assign(new Error(e), { kod: 409 });
  const onceki = ISLER.get(o.dizin);
  if (onceki && onceki.durum === 'calisiyor') return isGorunum(onceki);
  if (onceki && onceki.calisma) { try { fs.rmSync(onceki.calisma, { recursive: true, force: true }); } catch { /* */ } }
  const simdi = o.simdi != null ? o.simdi : Date.now();
  const is = { kimlik: crypto.randomBytes(6).toString('hex'), durum: 'calisiyor', bas: simdi, ilerleme: { metin: 'kaynak aranıyor' }, parmakIzi: parmakIzi(o.dizin),
    calisma: o.calisma || path.join(os.tmpdir(), `pusula-gerial-${String(o.kimlik).replace(/[^a-z0-9-]/gi, '')}-${zamanEtiketi(simdi)}`) };
  ISLER.set(o.dizin, is);
  is.soz = (async () => {
    try {
      const temelVeri = o.temelVeri || (typeof o.temelVeriFn === 'function' ? o.temelVeriFn() : null);
      const r = await onizle({ ...o, simdi, temelVeri, calisma: is.calisma,
        ilerleme: (p) => { is.ilerleme = { metin: `dakika ${p.adim}/${p.toplam} (${new Date(p.t).toISOString().slice(0, 16).replace('T', ' ')} UTC)`, yuzde: Math.round(100 * p.adim / p.toplam) }; } });
      is.sonuc = r; is.durum = 'bitti';
    } catch (err) { is.hata = err.message; is.durum = 'hata'; }
    is.bitis = Date.now();
    is.ilerleme = null;
  })();
  return isGorunum(is);
}

// ── 4. Uygulama ─────────────────────────────────────────────────────────────
/**
 * Önizlemesi biten işi uygular. Kapılar: engel (409), onay "GERIAL" (400), iş bitti + uygulanabilir, ≤ 30 dk, parmak izi aynı,
 * arada karar saati geçmedi (409). @returns { yedek, kopyalanan, silinen, sonuc }
 */
function uygulaDenetle(o) {
  const e = engel(o);
  if (e) throw Object.assign(new Error(e), { kod: 409 });
  if (!onayDogru(o.onay)) throw Object.assign(new Error(`onay eksik: gövdede { onay: "${ONAY}" } olmalı`), { kod: 400 });
  const is = ISLER.get(o.dizin);
  const simdi = o.simdi != null ? o.simdi : Date.now();
  if (!is || is.durum !== 'bitti' || !is.sonuc) throw Object.assign(new Error('önce önizleme yapılmalı (önizleme yok ya da sürüyor)'), { kod: 409 });
  if (o.isKimlik && o.isKimlik !== is.kimlik) throw Object.assign(new Error('önizleme değişti — ekrandaki önizlemeyi yenileyin'), { kod: 409 });
  if (!is.sonuc.uygulanabilir) throw Object.assign(new Error(`önizleme uygulanamaz: ${is.sonuc.redler.join(' · ')}`), { kod: 409 });
  if (simdi - is.sonuc.simdi > ONIZLEME_OMRU) throw Object.assign(new Error('önizleme 30 dakikadan eski — yeniden önizleyin (aradaki dakikalar simüle edilmedi)'), { kod: 409 });
  if (sonrakiKarar(is.sonuc.simdi) <= simdi) throw Object.assign(new Error('önizlemeden sonra karar saati (UTC 00:02) geçti — yeniden önizleyin'), { kod: 409 });
  if (parmakIzi(o.dizin) !== is.parmakIzi) throw Object.assign(new Error('önizlemeden sonra botun kayıtları değişti — yeniden önizleyin'), { kod: 409 });
  if (!is.calisma || !fs.existsSync(path.join(is.calisma, 'kagit-borsa.json'))) throw Object.assign(new Error('simülasyon klasörü bulunamadı — yeniden önizleyin'), { kod: 409 });
  return { is, simdi };
}

/**
 * Önizlemesi biten işi uygular (önce uygulaDenetle — aynı kapılar). Sunucu çağırmadan önce eski bot nesnesinin bağlantısını keser
 * (süren okumaların eski durumu diske yazmaması için) ve uygulamadan sonra botu dizinden yeniden kurar.
 */
function uygula(o) {
  const { is, simdi } = uygulaDenetle(o);
  const kaynak = is.calisma;

  // Yedek: bütün üst düzey dosyalar
  const yedek = path.join(o.dizin, YEDEK_KLASOR, zamanEtiketi(simdi));
  fs.mkdirSync(yedek, { recursive: true });
  const mevcut = ustDosyalar(o.dizin);
  for (const ad of mevcut) fs.copyFileSync(path.join(o.dizin, ad), path.join(yedek, ad));
  fs.writeFileSync(path.join(yedek, 'meta.json'), JSON.stringify({ zaman: simdi, sebep: 'kâğıt acil durdurmayı geri al — uygulamadan önceki dosyalar', acil: is.sonuc.acil && is.sonuc.acil.zaman, dosyalar: mevcut }, null, 1), 'utf8');

  const yeni = ustDosyalar(kaynak).filter(ad => !GUNLUK.has(ad));
  const kopyalanan = [], silinen = [];
  for (const ad of yeni) { atomikKopya(path.join(kaynak, ad), path.join(o.dizin, ad)); kopyalanan.push(ad); }
  for (const ad of mevcut) if (!GUNLUK.has(ad) && !yeni.includes(ad)) { fs.rmSync(path.join(o.dizin, ad), { force: true }); silinen.push(ad); }
  const r = is.sonuc;
  const satir = { zaman: simdi, olay: 'kagit-geri-al', acilZaman: r.acil ? r.acil.zaman : null, kaynak: r.kaynak ? r.kaynak.tur : null, kaynakZaman: r.kaynak ? r.kaynak.zaman : null,
    simSon: r.simdi, yedek: path.relative(o.dizin, yedek).split(path.sep).join('/'), degerOnce: r.deger ? r.deger.simdi : null, degerSonra: r.deger ? r.deger.sonra : null,
    pozisyon: r.son ? r.son.pozisyonlar.length : null, kararSayisi: (r.kararlar || []).length };
  fs.appendFileSync(path.join(o.dizin, 'alarmlar.jsonl'), JSON.stringify(satir) + '\n', 'utf8');
  ISLER.delete(o.dizin);
  try { fs.rmSync(kaynak, { recursive: true, force: true }); } catch { /* geçici klasör */ }
  return { yedek, kopyalanan, silinen, sonuc: r };
}

/** Uygulama sonrası mutabakat temiz değilse: dizini yedekteki hâline döndürür (yedekte olmayan üst düzey dosyalar silinir). */
function geriYukle(dizin, yedek) {
  const ydk = ustDosyalar(yedek).filter(a => a !== 'meta.json');
  for (const ad of ydk) atomikKopya(path.join(yedek, ad), path.join(dizin, ad));
  for (const ad of ustDosyalar(dizin)) if (!ydk.includes(ad)) fs.rmSync(path.join(dizin, ad), { force: true });
  return ydk.length;
}

module.exports = { ONAY, onayDogru, KAIROS, ANLIK_KLASOR, YEDEK_KLASOR, GUNLUK, ONIZLEME_OMRU, engel, acilOncesiKaydet, sonOlaylar, acilDolumlari, acilBtc, acilSonrasiSorunlar,
  gorunurluk, yedekHedefi, kaynakBul, kagitDeger, sonrakiKarar, simule, onizle, parmakIzi, isBaslat, isDurumu, uygulaDenetle, uygula, geriYukle, _ISLER: ISLER };
