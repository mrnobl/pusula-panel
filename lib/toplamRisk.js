'use strict';
/**
 * BÜTÜN HESAPLARIN TOPLAM RİSKİ (A3 — PLAN-MAKINE-HESAP-BOT §6 r1/r2, TASARIM-MAKINE-HESAP-BOT §6)
 * ═══════════════════════════════════════════════════════════════════════════
 * Her botun borsa hesabından (pozisyonlar, mark, özsermaye, felaket stopları) ölçülen risk, hesap türü (kâğıt / demo / canlı)
 * grubunda toplanır. Bu dosya SAF hesap + kayıt + kapı kararıdır; botlardan okuma ve uçlar lib/sunucu/toplamRiskUclari.js'te.
 *
 *   botOlc(girdi)                      bir botun satırı { ozsermaye, brutNominal, netNominal, netBtcNominal, kaldirac, marjOrani,
 *                                      felaketKayip, korunmasizNominal, semboller[] }                                    (SAF)
 *   toplamla(satirlar, esikler)        grup başına { ozsermaye, brutKaldirac, netBtcPay, tekSembolPay, tekHesapPay, felaketKayipPay }
 *                                      + eşik aşımları                                                                    (SAF)
 *   dagilim(kayitlar, gun)             son N günün p50 / p95 / en yüksek değeri (eşik onayına girdi)                        (SAF)
 *   esSatirlari(es, simdi)             eşin satırları; 6 saatten eski veri → SON BİLİNEN EN KÖTÜ değer + uyarı (karar §11 #10)  (SAF)
 *   kapiKarar(...)                     sınır kipinde pozisyonu BÜYÜTEN emir eşiği aşar mı (önbellekten, senkron)              (SAF)
 *   ToplamRisk                         ölçüm kaydı <veri>/live/toplam-risk.jsonl (YALNIZ EKLENİR), eş geçmişi, uyarı, durum
 *
 * KİP (r1, kullanıcı kararı): 'izleme' (varsayılan; ilk 14 gün yalnız ölçüm + uyarı, hiçbir emir engellenmez) | 'sinir'
 *   (kullanıcı 14 gün dolduktan sonra gerçek dağılıma bakıp eşikleri PIN + onayla verir). Sınır kipinde kapı yalnız pozisyonu
 *   BÜYÜTEN emri durdurur; azaltan emirler, reduceOnly ve stoplar her zaman serbest (r2 — emir freni gibi). Pusula kendiliğinden
 *   kip değiştirmez. Demo kabul botu (Kairos, mod demo, 2026-12-09 sonuna kadar) her kipte YALNIZ HABER alır (kapı ona bağlanmaz).
 *   Kullanıcı kararları (2026-10-25): SINIR yalnız canlı hesap grubuna (kâğıt / demo yalnız izlenir); izleme kipinde ve kâğıt / demo
 *   grubunda Telegram YOK (yalnız panel); Kairos'un satırı borsadan EK okuma yapılmadan botun kendi kaydından (sunucu modülü).
 * Felaket kaybı: borsada felaket stopu olan pozisyonda ≈ miktar × |mark − stop|; stopu olmayan kısımda (BTC ayağı, kâğıt hesap,
 *   belirsiz stop) nominal × FELAKET_SOK (%30 — Kairos'un ölçülmüş en kötü gün içi düşüşü −%30,6'ya yakın; tasarım kararı 3).
 */
const fs = require('fs');
const path = require('path');

const SAAT = 3600e3;
const GUN = 24 * SAAT;
const KIPLER = ['izleme', 'sinir'];
const IZLEME_GUN = 14;
const GRUPLAR = ['kagit', 'demo', 'canli'];
const GRUP_AD = { kagit: 'Kâğıt hesaplar', demo: 'Demo hesaplar', canli: 'Canlı hesap' };
/** Kullanıcı kararı (2026-10-25): sınır kipinde SINIR yalnız canlı hesap grubuna uygulanır; kâğıt ve demo yalnız izlenir. */
const SINIR_GRUP = 'canli';
/** Öneri eşikleri (TASARIM §6.1) — izleme kipinde yalnız UYARI içindir; sınır kipinde kullanıcının onayladığı değerler geçer. */
const ONERI_ESIKLER = Object.freeze({ brutKaldirac: 4, netBtcPay: 1.2, tekSembolPay: 0.35, felaketKayipPay: 0.25 });
const METRIKLER = [
  { anahtar: 'brutKaldirac', ad: 'Brüt kaldıraç', bicim: 'kat', aciklama: 'bütün pozisyonların toplam büyüklüğü ÷ toplam özsermaye' },
  { anahtar: 'netBtcPay', ad: 'Net BTC payı', bicim: 'yuzde', aciklama: 'BTC pozisyonlarının (BTC ayağı + kol) net büyüklüğü ÷ özsermaye' },
  { anahtar: 'tekSembolPay', ad: 'Tek coin payı', bicim: 'yuzde', aciklama: 'BTC dışındaki en büyük coin pozisyonu (bütün hesaplarda) ÷ özsermaye' },
  { anahtar: 'felaketKayipPay', ad: 'Felaket kaybı', bicim: 'yuzde', aciklama: 'bütün felaket stopları tetiklenirse (stopsuz kısımda %30 düşüş) kayıp ÷ özsermaye' },
];
const FELAKET_SOK = 0.30;
const ES_BAYAT_MS = 6 * SAAT;          // eş verisi bundan eskiyse son bilinen EN KÖTÜ değer (karar §11 #10)
const ES_GECMIS_MS = IZLEME_GUN * GUN; // eşin en kötü değeri bu pencereden
const KAYIT_ARALIK_MS = SAAT;          // ölçüm kaydı saatte bir (izleme kipinde ölçüm de saatte bir)
const SINIR_OLCUM_MS = 5 * 60e3;       // sınır kipinde ölçüm 5 dk'da bir (kapının önbelleği)
const KAPI_BAYAT_MS = 15 * 60e3;       // sınır kipinde önbellek bundan eskiyse BÜYÜTEN emir verilmez (kapalı-başarısız)
const UYARI_KISIT_MS = 24 * SAAT;      // izleme uyarısı: aşım başlayınca bir kez, sürerse günde en çok bir hatırlatma
const ENGEL_KISIT_MS = 6 * SAAT;       // sınır kipi engel bildirimi anahtar başına 6 sa (TASARIM §6.4)
const DOSYA = 'toplam-risk.jsonl';
const ES_DOSYA = 'toplam-risk-esler.json';
/** Demo kabul bitişi — lib/live/veriKalitesi.js ve lib/ozDenetim.js ile AYNI kaynak. */
const { KORUMA_BITIS } = require('./live/veriKalitesi');

const sayi = (x) => (Number.isFinite(+x) ? +x : null);
const yuvarla = (x, n = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : null);
const yuzde = (x, n = 0) => (Number.isFinite(x) ? `%${(x * 100).toFixed(n).replace('.', ',')}` : '—');
const kat = (x) => (Number.isFinite(x) ? `${x.toFixed(2).replace('.', ',')}×` : '—');
const bicimle = (m, v) => ((METRIKLER.find(x => x.anahtar === m) || {}).bicim === 'kat' ? kat(v) : yuzde(v, 1));
const varlikAdi = (s) => String(s || '').split(/[/:]/)[0].replace(/USDT$/, '').toUpperCase() || '?';

/** Saf: demo kabul botu mu (her kipte yalnız haber). */
function dokunulmaz(mod, simdi = Date.now()) { return mod === 'demo' && simdi < KORUMA_BITIS; }

/** Saf: eşik nesnesi denetimi → { ok, esikler, hatalar }. Bilinen 4 anahtar; her biri pozitif sayı (kaldıraç ≤ 50, paylar ≤ 10). */
function esikDogrula(e) {
  const hatalar = [];
  const o = {};
  if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, esikler: null, hatalar: ['eşikler nesne olmalı'] };
  for (const m of METRIKLER) {
    const v = e[m.anahtar];
    if (v === undefined || v === null || v === '') { hatalar.push(`${m.ad}: eksik`); continue; }
    const n = +v;
    if (!Number.isFinite(n) || n <= 0) { hatalar.push(`${m.ad}: pozitif sayı olmalı`); continue; }
    if (n > (m.bicim === 'kat' ? 50 : 10)) { hatalar.push(`${m.ad}: çok büyük`); continue; }
    o[m.anahtar] = n;
  }
  for (const k of Object.keys(e)) if (!METRIKLER.some(m => m.anahtar === k)) hatalar.push(`bilinmeyen eşik: ${String(k).slice(0, 30)}`);
  return { ok: !hatalar.length, esikler: hatalar.length ? null : o, hatalar };
}

/** Saf: ayar (config.toplamRisk) → { kip, baslangic (ms|null), esikler (onaylı|null), onay, gecerliEsikler (kipe göre) }. */
function ayarCoz(a) {
  const v = a && typeof a === 'object' ? a : {};
  const kip = KIPLER.includes(v.kip) ? v.kip : 'izleme';
  const bas = v.baslangic == null ? NaN : (typeof v.baslangic === 'number' ? v.baslangic : Date.parse(v.baslangic));
  const d = v.esikler ? esikDogrula(v.esikler) : { ok: false, esikler: null };
  const onayli = d.ok ? d.esikler : null;
  // Sınır kipi ancak onaylı eşikle geçerli; eşik bozuksa İZLEME (kapı bağlanmaz) — panel nedeni gösterir.
  const etkinKip = kip === 'sinir' && onayli ? 'sinir' : 'izleme';
  return { kip: etkinKip, istenenKip: kip, baslangic: Number.isFinite(bas) && bas > 0 ? bas : null, esikler: onayli, onay: v.onay || null,
    gecerliEsikler: etkinKip === 'sinir' ? onayli : { ...ONERI_ESIKLER }, esikBozuk: kip === 'sinir' && !onayli,
    // Grup başına geçerli eşik: sınır kipinde yalnız canlı hesap onaylı sınırla; kâğıt / demo her zaman öneri eşiğiyle (yalnız izleme).
    grupEsikleri: Object.fromEntries(GRUPLAR.map(g => [g, etkinKip === 'sinir' && g === SINIR_GRUP ? onayli : { ...ONERI_ESIKLER }])) };
}

/**
 * SAF: bir botun satırı.
 * @param g.hesap      CanliYurutucu.hesap() çıktısı { bakiye: { toplam }, pozisyonlar: [{ symbol, side, miktar, mark, nominal }] }
 * @param g.btcAyak    'perp' | 'spot' | 'coklu'
 * @param g.btcSpot    { miktar, fiyat } — perp dışı BTC ayağı (vadeli pozisyon değil)
 * @param g.spotUsdt   çoklu varlıkta spot USDT kalıntısı
 * @param g.stoplar    KorumaEmri durum.stoplar { <symbol>: { fiyat, yon, miktar|null, belirsiz } }
 * @param g.marj       bot durum.sonMarj { oran }
 */
function botOlc(g = {}) {
  const h = g.hesap || {};
  const sok = Number.isFinite(g.felaketSok) && g.felaketSok > 0 ? g.felaketSok : FELAKET_SOK;
  const usdt = sayi(h.bakiye && h.bakiye.toplam) || 0;
  const spot = g.btcAyak && g.btcAyak !== 'perp' && g.btcSpot ? { q: sayi(g.btcSpot.miktar) || 0, f: sayi(g.btcSpot.fiyat) || 0 } : null;
  const ozsermaye = usdt + (spot ? spot.q * spot.f : 0) + (g.btcAyak === 'coklu' ? (sayi(g.spotUsdt) || 0) : 0);
  const varliklar = {};
  let brut = 0, net = 0, felaket = 0, korunmasiz = 0;
  const ekle = (varlik, imzali) => { varliklar[varlik] = (varliklar[varlik] || 0) + imzali; };
  for (const p of Array.isArray(h.pozisyonlar) ? h.pozisyonlar : []) {
    const q = Math.abs(sayi(p.miktar) || 0);
    if (!(q > 0)) continue;
    const mark = sayi(p.mark) > 0 ? +p.mark : (Math.abs(sayi(p.nominal) || 0) / q);
    if (!(mark > 0)) continue;
    const yon = p.side === 'short' ? -1 : 1;
    const n = q * mark;
    brut += n; net += yon * n;
    ekle(varlikAdi(p.symbol), yon * n);
    const st = g.stoplar && g.stoplar[p.symbol];
    const ayniYon = st && ((st.yon === 'long' && yon > 0) || (st.yon === 'short' && yon < 0));
    if (ayniYon && !st.belirsiz && sayi(st.fiyat) > 0) {
      const kq = st.miktar == null ? q : Math.min(q, Math.abs(sayi(st.miktar) || 0));
      const mesafe = yon > 0 ? Math.max(0, mark - st.fiyat) : Math.max(0, st.fiyat - mark);
      felaket += kq * mesafe + (q - kq) * mark * sok;
      korunmasiz += (q - kq) * mark;
    } else { felaket += n * sok; korunmasiz += n; }
  }
  if (spot && spot.q > 0 && spot.f > 0) {
    const n = spot.q * spot.f;
    brut += n; net += n; ekle('BTC', n); felaket += n * sok; korunmasiz += n;
  }
  const semboller = Object.entries(varliklar).map(([varlik, nominal]) => ({ varlik, nominal: yuvarla(nominal, 2) }))
    .sort((a, b) => Math.abs(b.nominal) - Math.abs(a.nominal)).slice(0, 40);
  const marjOrani = g.marj && Number.isFinite(+g.marj.oran) ? +g.marj.oran : null;
  return {
    kimlik: String(g.kimlik || ''), adGorunen: g.adGorunen ? String(g.adGorunen).slice(0, 60) : null, mod: GRUPLAR.includes(g.mod) ? g.mod : null,
    hesap: g.hesapId ? String(g.hesapId).slice(0, 64) : null, makine: g.makine || null,
    zaman: new Date(Number.isFinite(g.simdi) ? g.simdi : Date.now()).toISOString(),
    ozsermaye: yuvarla(ozsermaye, 2), brutNominal: yuvarla(brut, 2), netNominal: yuvarla(net, 2), netBtcNominal: yuvarla(varliklar.BTC || 0, 2),
    kaldirac: ozsermaye > 0 ? yuvarla(brut / ozsermaye, 4) : null, marjOrani, felaketKayip: yuvarla(felaket, 2), korunmasizNominal: yuvarla(korunmasiz, 2),
    semboller, olculemedi: null, dokunulmaz: dokunulmaz(g.mod, Number.isFinite(g.simdi) ? g.simdi : Date.now()),
  };
}

/** Saf: ölçülemeyen bot satırı (bağlı değil / okuma hatası) — toplamlara girmez, panelde nedeniyle görünür. */
function olculemedi(g = {}, neden) {
  return { kimlik: String(g.kimlik || ''), adGorunen: g.adGorunen ? String(g.adGorunen).slice(0, 60) : null, mod: GRUPLAR.includes(g.mod) ? g.mod : null,
    hesap: g.hesapId ? String(g.hesapId).slice(0, 64) : null, makine: g.makine || null, zaman: new Date(Number.isFinite(g.simdi) ? g.simdi : Date.now()).toISOString(),
    olculemedi: String(neden || 'ölçülemedi').slice(0, 200), dokunulmaz: dokunulmaz(g.mod, Number.isFinite(g.simdi) ? g.simdi : Date.now()) };
}

/** Saf: aynı borsa hesabı iki kez sayılmasın (kâğıt dışı hesap kimliği tekil; kâğıtta makine + bot). Taze olan kalır. */
function tekille(satirlar) {
  const m = new Map();
  for (const s of satirlar) {
    if (!s || !s.kimlik) continue;
    const k = s.mod !== 'kagit' && s.hesap ? `h:${s.hesap}` : `b:${s.makine || 'yerel'}:${s.kimlik}`;
    const o = m.get(k);
    const olculdu = (x) => !x.olculemedi;
    if (!o || (olculdu(s) && !olculdu(o)) || (olculdu(s) === olculdu(o) && Date.parse(s.zaman) > Date.parse(o.zaman))) m.set(k, s);
  }
  return [...m.values()];
}

/** Saf: grup toplamları + eşik aşımları. @param esikler { brutKaldirac, netBtcPay, tekSembolPay, felaketKayipPay } ya da { <grup>: {...} } */
function toplamla(satirlar, esikler = ONERI_ESIKLER) {
  const gruplar = {};
  const asim = [];
  const tek = tekille(satirlar || []);
  for (const grup of GRUPLAR) {
    const l = tek.filter(s => s.mod === grup && !s.olculemedi);
    const olcuMedi = tek.filter(s => s.mod === grup && s.olculemedi).length;
    if (!l.length) { if (olcuMedi) gruplar[grup] = { grup, ad: GRUP_AD[grup], botSayisi: 0, olculemeyen: olcuMedi, ozsermaye: 0 }; continue; }
    const ozs = l.reduce((a, s) => a + (s.ozsermaye || 0), 0);
    const brut = l.reduce((a, s) => a + (s.brutNominal || 0), 0);
    const netBtc = l.reduce((a, s) => a + (s.netBtcNominal || 0), 0);
    const felaket = l.reduce((a, s) => a + (s.felaketKayip || 0), 0);
    const varlikBrut = {};
    for (const s of l) for (const x of s.semboller || []) varlikBrut[x.varlik] = (varlikBrut[x.varlik] || 0) + Math.abs(x.nominal || 0);
    const enBuyuk = Object.entries(varlikBrut).filter(([v]) => v !== 'BTC').sort((a, b) => b[1] - a[1])[0] || null;
    const hesapOzs = {};
    for (const s of l) { const k = s.hesap || `${s.makine || 'yerel'}:${s.kimlik}`; hesapOzs[k] = (hesapOzs[k] || 0) + (s.ozsermaye || 0); }
    const enBuyukHesap = Object.entries(hesapOzs).sort((a, b) => b[1] - a[1])[0] || null;
    const pay = (x) => (ozs > 0 ? x / ozs : null);
    const g = {
      grup, ad: GRUP_AD[grup], botSayisi: l.length, olculemeyen: olcuMedi,
      ozsermaye: yuvarla(ozs, 2), brutNominal: yuvarla(brut, 2), netBtcNominal: yuvarla(netBtc, 2), felaketKayip: yuvarla(felaket, 2),
      brutKaldirac: ozs > 0 ? yuvarla(brut / ozs, 4) : null, netBtcPay: ozs > 0 ? yuvarla(netBtc / ozs, 4) : null,
      tekSembolPay: ozs > 0 ? yuvarla((enBuyuk ? enBuyuk[1] : 0) / ozs, 4) : null, tekSembol: enBuyuk ? enBuyuk[0] : null,
      tekHesapPay: ozs > 0 && enBuyukHesap ? yuvarla(enBuyukHesap[1] / ozs, 4) : null,
      felaketKayipPay: ozs > 0 ? yuvarla(felaket / ozs, 4) : null,
      varlikBrut: Object.fromEntries(Object.entries(varlikBrut).map(([k, v]) => [k, yuvarla(v, 2)])),
      asim: [],
    };
    if (!(ozs > 0)) g.uyari = 'özsermaye sıfır ya da okunamadı — oranlar hesaplanamadı';
    const ge = esikler && GRUPLAR.some(x => esikler[x] && typeof esikler[x] === 'object') ? esikler[grup] : esikler;
    for (const m of METRIKLER) {
      const v = g[m.anahtar], e = ge && ge[m.anahtar];
      // Net BTC payında yön önemli değil (kısa BTC de risk): mutlak değer eşikle karşılaştırılır.
      const kiyas = m.anahtar === 'netBtcPay' && Number.isFinite(v) ? Math.abs(v) : v;
      if (Number.isFinite(kiyas) && Number.isFinite(e) && kiyas > e) {
        const a = { grup, metrik: m.anahtar, ad: m.ad, deger: v, esik: e, metin: `${GRUP_AD[grup]}: ${m.ad} ${bicimle(m.anahtar, v)} > ${bicimle(m.anahtar, e)}${m.anahtar === 'tekSembolPay' && g.tekSembol ? ` (${g.tekSembol})` : ''}` };
        g.asim.push(a); asim.push(a);
      }
    }
    gruplar[grup] = g;
  }
  return { gruplar, asim, botlar: tek };
}

/** Saf: yüzdelik (sıralı dizide doğrusal ara değer). */
function yuzdelik(s, p) {
  if (!s.length) return null;
  const i = (s.length - 1) * p, a = Math.floor(i), b = Math.ceil(i);
  return s[a] + (s[b] - s[a]) * (i - a);
}

/** Saf: kayıtlardan son `gun` günün dağılımı — grup × metrik { n, p50, p95, maks, son }. */
function dagilim(kayitlar, { gun = IZLEME_GUN, simdi = Date.now() } = {}) {
  const bas = simdi - gun * GUN;
  const o = {};
  for (const grup of GRUPLAR) {
    const l = (kayitlar || []).filter(k => k && Date.parse(k.zaman) >= bas && k.gruplar && k.gruplar[grup] && k.gruplar[grup].botSayisi > 0);
    if (!l.length) continue;
    o[grup] = {};
    for (const m of METRIKLER) {
      const d = l.map(k => k.gruplar[grup][m.anahtar]).filter(Number.isFinite).map(v => (m.anahtar === 'netBtcPay' ? Math.abs(v) : v)).sort((a, b) => a - b);
      o[grup][m.anahtar] = { n: d.length, p50: yuvarla(yuzdelik(d, 0.5), 4), p95: yuvarla(yuzdelik(d, 0.95), 4), maks: d.length ? yuvarla(d[d.length - 1], 4) : null };
    }
  }
  return o;
}

/** Saf: en kötü değerli satır birleşimi (eş bayatken): büyüklükler EN YÜKSEK, özsermaye EN DÜŞÜK, semboller varlık başına en büyük |nominal|. */
function enKotuSatir(gecmis) {
  const l = (gecmis || []).filter(s => s && !s.olculemedi);
  if (!l.length) return null;
  const son = l.reduce((a, s) => (Date.parse(s.zaman) > Date.parse(a.zaman) ? s : a));
  const enB = (k) => Math.max(...l.map(s => (Number.isFinite(s[k]) ? s[k] : -Infinity)));
  const enBMutlak = (k) => { const x = l.map(s => s[k]).filter(Number.isFinite); return x.length ? x.reduce((a, v) => (Math.abs(v) > Math.abs(a) ? v : a)) : 0; };
  const ozs = Math.min(...l.map(s => (Number.isFinite(s.ozsermaye) ? s.ozsermaye : Infinity)));
  const sem = {};
  for (const s of l) for (const x of s.semboller || []) if (!(x.varlik in sem) || Math.abs(x.nominal) > Math.abs(sem[x.varlik])) sem[x.varlik] = x.nominal;
  const brut = enB('brutNominal');
  return { ...son, ozsermaye: Number.isFinite(ozs) ? ozs : son.ozsermaye, brutNominal: brut, netNominal: enBMutlak('netNominal'), netBtcNominal: enBMutlak('netBtcNominal'),
    felaketKayip: enB('felaketKayip'), korunmasizNominal: enB('korunmasizNominal'), kaldirac: ozs > 0 && Number.isFinite(ozs) ? yuvarla(brut / ozs, 4) : son.kaldirac,
    semboller: Object.entries(sem).map(([varlik, nominal]) => ({ varlik, nominal })).sort((a, b) => Math.abs(b.nominal) - Math.abs(a.nominal)).slice(0, 40),
    enKotu: true };
}

/**
 * Saf: bir eşin satırları. @param es { kimlik, ad, son: { zaman, satirlar }, gecmis: [{ zaman, satirlar }] }
 * Son başarılı okuma 6 saatten eskiyse her bot için 14 günlük geçmişin EN KÖTÜ değeri + uyarı (karar §11 #10, tutucu yön).
 * Hiç okunamamış eş → satır yok + uyarı.
 */
function esSatirlari(es, simdi = Date.now()) {
  if (!es || !es.son || !Array.isArray(es.son.satirlar)) return { satirlar: [], bayat: true, uyari: `${(es && es.ad) || 'eş'}: risk verisi hiç okunamadı — toplamda yok` };
  const yas = simdi - Date.parse(es.son.zaman);
  if (!(yas > ES_BAYAT_MS)) return { satirlar: es.son.satirlar.map(s => ({ ...s, makine: es.kimlik })), bayat: false, uyari: null };
  const kimlikler = new Set(es.son.satirlar.map(s => s.kimlik));
  const satirlar = [];
  for (const k of kimlikler) {
    const g = [...(es.gecmis || []), es.son].filter(x => x && simdi - Date.parse(x.zaman) <= ES_GECMIS_MS + yas).flatMap(x => (x.satirlar || []).filter(s => s.kimlik === k));
    const s = enKotuSatir(g) || es.son.satirlar.find(s => s.kimlik === k);
    if (s) satirlar.push({ ...s, makine: es.kimlik, enKotu: true });
  }
  return { satirlar, bayat: true, uyari: `${es.ad || es.kimlik}: risk verisi ${Math.round(yas / SAAT)} saattir okunamadı — son bilinen EN KÖTÜ değer kullanılıyor` };
}

/**
 * SAF KAPI KARARI (sınır kipi, r2). Yalnız pozisyonu BÜYÜTEN emre sorulur (çağıran yürütücü / BTC ayağı bunu garanti eder).
 * @param o.olcum   son toplam { zaman (ms), gruplar }
 * @param o.ek      bu ölçümden sonra kapıdan geçen artışlar { <grup>: { brut, btc, varlik: { X: n }, felaket } } (aynı çalışmada çok emir)
 * @param o.grup    botun hesap türü
 * @param o.esikler onaylı eşikler
 * @param o.istek   { symbol, side, nominal, netOnce, netSonra, mark }
 * @returns {{ engel: string|null, metrik?, artis }} — artis çağırana ek'e yazması için (engel yoksa)
 */
function kapiKarar({ olcum, ek = {}, grup, esikler, istek, simdi = Date.now(), felaketSok = FELAKET_SOK } = {}) {
  if (!esikler) return { engel: null, artis: null };
  if (!olcum || !Number.isFinite(olcum.zaman)) return { engel: 'toplam risk henüz ölçülmedi — büyüten emir verilmez' };
  if (simdi - olcum.zaman > KAPI_BAYAT_MS) return { engel: `toplam risk ölçümü ${Math.round((simdi - olcum.zaman) / 60e3)} dk eski — büyüten emir verilmez (ölçüm 5 dk'da bir)` };
  const g = olcum.gruplar && olcum.gruplar[grup];
  const ozs = g && g.ozsermaye;
  if (!(ozs > 0)) return { engel: `toplam risk: ${GRUP_AD[grup] || grup} özsermayesi okunamadı — büyüten emir verilmez` };
  const mark = +istek.mark;
  const once = Math.abs(+istek.netOnce || 0) * mark, sonra = Math.abs(+istek.netSonra || 0) * mark;
  const d = Math.max(0, sonra - once);
  if (!(d > 0)) return { engel: null, artis: null };
  const e = ek[grup] || { brut: 0, btc: 0, varlik: {}, felaket: 0 };
  const varlik = varlikAdi(istek.symbol);
  const imzaliD = ((+istek.netSonra || 0) - (+istek.netOnce || 0)) * mark;
  const proj = {
    brutKaldirac: ((g.brutNominal || 0) + e.brut + d) / ozs,
    netBtcPay: varlik === 'BTC' ? Math.abs((g.netBtcNominal || 0) + e.btc + imzaliD) / ozs : null,
    tekSembolPay: varlik !== 'BTC' ? (((g.varlikBrut || {})[varlik] || 0) + (e.varlik[varlik] || 0) + d) / ozs : null,
    felaketKayipPay: ((g.felaketKayip || 0) + e.felaket + d * felaketSok) / ozs,
  };
  for (const m of METRIKLER) {
    const v = proj[m.anahtar], s = esikler[m.anahtar];
    if (Number.isFinite(v) && Number.isFinite(s) && v > s) {
      return { engel: `toplam risk sınırı — ${GRUP_AD[grup]}: ${m.ad} bu emirle ${bicimle(m.anahtar, v)} olur > onaylı sınır ${bicimle(m.anahtar, s)}${m.anahtar === 'tekSembolPay' ? ` (${varlik})` : ''}; yalnız azaltan emir ve stoplar serbest`, metrik: m.anahtar };
    }
  }
  return { engel: null, artis: { grup, brut: d, btc: varlik === 'BTC' ? imzaliD : 0, varlik: varlik !== 'BTC' ? { [varlik]: d } : {}, felaket: d * felaketSok } };
}

/** Saf: izleme bilgisi (14 gün; OTOMATİK GEÇİŞ YOK). */
function izlemeBilgisi({ kip, baslangic, ilkKayit, simdi = Date.now() } = {}) {
  const bas = Number.isFinite(baslangic) ? baslangic : (Number.isFinite(ilkKayit) ? ilkKayit : null);
  const gun = bas != null ? Math.floor((simdi - bas) / GUN) : null;
  const doldu = bas != null && simdi - bas >= IZLEME_GUN * GUN;
  if (kip === 'sinir') return { kip, bas, gun, doldu, izlemeGun: IZLEME_GUN, mesaj: 'Sınır kipi (yalnız canlı hesap): onaylı sınırı aşacak BÜYÜTEN emir verilmez; azaltan emirler ve stoplar serbest. Kâğıt ve demo hesaplar yalnız izlenir.' };
  const mesaj = bas == null ? 'İzleme kipi: ilk ölçüm bekleniyor. Hiçbir emir engellenmez.'
    : doldu ? `İzleme ${IZLEME_GUN} günü doldu (${gun} gün). Gerçek dağılıma (orta değer / %95 / en yüksek) bakıp sınırları onaylayabilirsiniz — Pusula kendiliğinden sınır kipine geçmez.`
      : `İzleme kipi: ${gun + 1}. gün (${IZLEME_GUN} günde dolar). Öneri eşikleri yalnız uyarı içindir; hiçbir emir engellenmez.`;
  return { kip, bas, gun, doldu, izlemeGun: IZLEME_GUN, kalanGun: bas != null && !doldu ? Math.max(0, IZLEME_GUN - gun) : null, mesaj };
}

/**
 * TOPLAM RİSK HİZMETİ — ölçüm, kayıt, eş geçmişi, uyarı, kapı önbelleği. Ağ ve bot okuması `kaynak`/`esler` işlevlerinden gelir.
 * @param o.dizin    <veri>/live
 * @param o.ayarFn   () → config.toplamRisk
 * @param o.kaynak   async () → yerel bot satırları (botOlc / olculemedi)
 * @param o.esler    async () → [{ kimlik, ad, satirlar } | { kimlik, ad, hata }]  (eş yoksa [])
 * @param o.bildir   (tur 'uyari'|'alarm'|'bilgi', baslik, satirlar, { anahtar, kisitMs }) → Telegram (isteğe bağlı)
 * @param o.kaydet   (seviye, metin) günlük
 */
class ToplamRisk {
  constructor(o = {}) {
    this.dizin = o.dizin || null;
    this.dosya = this.dizin ? path.join(this.dizin, DOSYA) : null;
    this.esDosya = this.dizin ? path.join(this.dizin, ES_DOSYA) : null;
    this.ayarFn = o.ayarFn || (() => ({}));
    this.kaynak = o.kaynak || (async () => []);
    this.eslerFn = o.esler || (async () => []);
    this.bildir = o.bildir || null;
    this.kaydet = o.kaydet || (() => {});
    this.simdi = o.simdi || Date.now;
    this.son = null;            // son ölçüm { zaman, gruplar, asim, botlar, esUyarilari }
    this.ek = {};               // kapıdan geçen artışlar (son ölçümden beri)
    this.sonKayit = 0;
    this.uyariDurum = {};       // anahtar → { bas, sonBildirim }
    this._sure = null;
    this.engelSon = {};         // engel bildirim kısıtı
    this.ilkKayit = null;
    this._ilkKayitOku();
  }

  ayar() { return ayarCoz(this.ayarFn()); }

  _ilkKayitOku() {
    if (!this.dosya) return;
    try {
      const fd = fs.openSync(this.dosya, 'r');
      try { const b = Buffer.alloc(4096); const n = fs.readSync(fd, b, 0, 4096, 0); const s = b.slice(0, n).toString('utf8').split('\n')[0]; const t = Date.parse(JSON.parse(s).zaman); if (Number.isFinite(t)) this.ilkKayit = t; } finally { fs.closeSync(fd); }
    } catch { /* dosya yok / bozuk ilk satır */ }
  }

  /** Kayıtlar (yalnız eklenen dosya; bozuk satır atlanır). @param gun son N gün (null = hepsi) */
  oku(gun = IZLEME_GUN + 1) {
    if (!this.dosya) return [];
    let m;
    try { m = fs.readFileSync(this.dosya, 'utf8'); } catch { return []; }
    const bas = gun == null ? -Infinity : this.simdi() - gun * GUN;
    const o = [];
    for (const s of m.split('\n')) { if (!s.trim()) continue; try { const x = JSON.parse(s); if (Date.parse(x.zaman) >= bas) o.push(x); } catch { /* yarım satır */ } }
    return o;
  }

  _esOku() { try { const j = JSON.parse(fs.readFileSync(this.esDosya, 'utf8')); return j && typeof j === 'object' && j.esler ? j : { surum: 1, esler: {} }; } catch { return { surum: 1, esler: {} }; } }
  _esYaz(d) {
    if (!this.esDosya) return;
    try { fs.mkdirSync(path.dirname(this.esDosya), { recursive: true }); const t = `${this.esDosya}.tmp`; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, this.esDosya); } catch (e) { this.kaydet('WARN', `[TOPLAM RİSK] eş geçmişi yazılamadı: ${e.message}`); }
  }

  /** Eşlerden okunanı geçmişe işler, eş satırlarını (bayatsa en kötü) döner. */
  _esIsle(okunan) {
    const simdi = this.simdi();
    const d = this._esOku();
    const uyarilar = [];
    const satirlar = [];
    const gorulen = new Set();
    for (const e of okunan || []) {
      if (!e || !e.kimlik) continue;
      gorulen.add(e.kimlik);
      const x = d.esler[e.kimlik] || { kimlik: e.kimlik, ad: e.ad || e.kimlik, gecmis: [] };
      x.ad = e.ad || x.ad;
      if (Array.isArray(e.satirlar)) {
        const yeni = { zaman: new Date(simdi).toISOString(), satirlar: e.satirlar };
        if (x.son) x.gecmis = [...(x.gecmis || []), x.son];
        x.son = yeni; x.hata = null;
      } else x.hata = String(e.hata || 'okunamadı').slice(0, 200);
      x.gecmis = (x.gecmis || []).filter(g => simdi - Date.parse(g.zaman) <= ES_GECMIS_MS).slice(-24 * IZLEME_GUN);
      d.esler[e.kimlik] = x;
    }
    // eşleme kaldırılan eş toplamdan çıkar (eş listesi okunamadıysa — okunan null — geçmiş olduğu gibi kalır)
    if (okunan) { for (const k of Object.keys(d.esler)) if (!gorulen.has(k)) delete d.esler[k]; this._esYaz(d); }
    for (const x of Object.values(d.esler)) {
      const r = esSatirlari(x, simdi);
      satirlar.push(...r.satirlar);
      if (r.uyari) uyarilar.push(r.uyari + (x.hata ? ` (${x.hata})` : ''));
    }
    return { satirlar, uyarilar };
  }

  /** Bir ölçüm turu: yerel + eşler → toplam; saatte bir kayıt; uyarılar. */
  async olc({ kayit = null, eslerDahil = true } = {}) {
    if (this._sure) return this._sure;
    this._sure = (async () => {
      const simdi = this.simdi();
      const a = this.ayar();
      let yerel = [];
      try { yerel = await this.kaynak(); } catch (e) { this.kaydet('WARN', `[TOPLAM RİSK] yerel botlar ölçülemedi: ${e.message}`); }
      let es = { satirlar: [], uyarilar: [] };
      if (eslerDahil) {
        let okunan = [];
        try { okunan = await this.eslerFn(); } catch (e) { okunan = null; this.kaydet('WARN', `[TOPLAM RİSK] eşler okunamadı: ${e.message}`); }
        es = this._esIsle(okunan);
      }
      const t = toplamla([...yerel, ...es.satirlar], a.grupEsikleri);
      const olcum = { zaman: simdi, kip: a.kip, gruplar: t.gruplar, asim: t.asim, botlar: t.botlar, esUyarilari: es.uyarilar };
      this.son = olcum;
      this.ek = {};
      const yaz = kayit === true || (kayit !== false && simdi - this.sonKayit >= KAYIT_ARALIK_MS - 60e3);
      if (yaz) this._kayitEkle(olcum);
      this._uyar(olcum, a);
      return olcum;
    })();
    try { return await this._sure; } finally { this._sure = null; }
  }

  _kayitEkle(o) {
    if (!this.dosya) return;
    const satir = { zaman: new Date(o.zaman).toISOString(), kip: o.kip, gruplar: {}, asim: o.asim.map(a => ({ grup: a.grup, metrik: a.metrik, deger: a.deger, esik: a.esik })),
      botlar: o.botlar.map(b => (b.olculemedi ? { kimlik: b.kimlik, mod: b.mod, makine: b.makine || null, olculemedi: b.olculemedi }
        : { kimlik: b.kimlik, mod: b.mod, makine: b.makine || null, hesap: b.hesap, ozsermaye: b.ozsermaye, brutNominal: b.brutNominal, netBtcNominal: b.netBtcNominal,
          kaldirac: b.kaldirac, felaketKayip: b.felaketKayip, marjOrani: b.marjOrani, ...(b.enKotu ? { enKotu: true } : {}), ...(b.kaynak ? { kaynak: b.kaynak } : {}) })),
      ...(o.esUyarilari.length ? { esUyarilari: o.esUyarilari } : {}) };
    for (const [g, x] of Object.entries(o.gruplar)) {
      satir.gruplar[g] = { botSayisi: x.botSayisi, olculemeyen: x.olculemeyen, ozsermaye: x.ozsermaye, brutKaldirac: x.brutKaldirac, netBtcPay: x.netBtcPay,
        tekSembolPay: x.tekSembolPay, tekSembol: x.tekSembol, tekHesapPay: x.tekHesapPay, felaketKayipPay: x.felaketKayipPay };
    }
    try {
      fs.mkdirSync(this.dizin, { recursive: true });
      fs.appendFileSync(this.dosya, JSON.stringify(satir) + '\n');
      this.sonKayit = o.zaman;
      if (this.ilkKayit == null) this.ilkKayit = o.zaman;
    } catch (e) { this.kaydet('WARN', `[TOPLAM RİSK] kayıt yazılamadı: ${e.message}`); }
  }

  /** İzleme uyarısı: aşım BAŞLAYINCA bir kez (Telegram + günlük), sürerse günde en çok bir hatırlatma, bitince tek "geçti". */
  /**
   * Uyarı (kullanıcı kararı 2026-10-25): İZLEME kipinde ve kâğıt / demo grubunda Telegram YOK — yalnız panel (Sağlık kartı, öz denetim,
   * Sorunlar) ve günlük (INFO). Telegram yalnız SINIR kipinde canlı hesap grubunun aşımında: başlayınca bir kez, sürerse günde bir,
   * bitince tek "eşiğin altına indi".
   */
  _uyar(o, a) {
    const simdi = o.zaman;
    const simdiki = new Set(o.asim.map(x => `${x.grup}:${x.metrik}`));
    const tg = (grup) => a.kip === 'sinir' && grup === SINIR_GRUP;
    for (const x of o.asim) {
      const k = `${x.grup}:${x.metrik}`;
      let d = this.uyariDurum[k];
      if (!d) {
        d = this.uyariDurum[k] = { bas: simdi, sonBildirim: null };
        this.kaydet(tg(x.grup) ? 'WARN' : 'INFO', `[TOPLAM RİSK] ${x.metin}${tg(x.grup) ? '' : ' — yalnız izleme: emir engellenmez, Telegram yok'}`);
      }
      if (!tg(x.grup)) continue;
      if (d.sonBildirim == null) {
        d.sonBildirim = simdi;
        this._bildir('uyari', 'Toplam risk sınırı aşıldı', [x.metin, 'Sınır kipi: bu sınırı aşacak büyüten emir verilmez; azaltan emir ve stoplar serbest.', 'Ayrıntı: Sistem › Sağlık › Toplam risk'], `toplam-risk:${k}`);
      } else if (simdi - d.sonBildirim >= UYARI_KISIT_MS) {
        d.sonBildirim = simdi;
        this._bildir('uyari', 'Toplam risk sınırı aşımı sürüyor', [x.metin, `${Math.round((simdi - d.bas) / SAAT)} saattir sürüyor.`], `toplam-risk-suruyor:${k}`);
      }
    }
    for (const k of Object.keys(this.uyariDurum)) {
      if (simdiki.has(k)) continue;
      const d = this.uyariDurum[k];
      delete this.uyariDurum[k];
      const [grup, metrik] = k.split(':');
      const m = METRIKLER.find(z => z.anahtar === metrik);
      this.kaydet('INFO', `[TOPLAM RİSK] ${GRUP_AD[grup] || grup}: ${m ? m.ad : metrik} yeniden eşiğin altında`);
      if (d && d.sonBildirim != null) this._bildir('bilgi', 'Toplam risk sınırın altına indi', [`${GRUP_AD[grup] || grup}: ${m ? m.ad : metrik} yeniden sınırın altında.`], `toplam-risk-gecti:${k}`);
    }
  }

  _bildir(tur, baslik, satirlar, anahtar, kisitMs = UYARI_KISIT_MS) {
    if (!this.bildir) return;
    try { Promise.resolve(this.bildir(tur, baslik, satirlar, { anahtar, kisitMs })).catch(() => null); } catch { /* bildirim yok */ }
  }

  /**
   * Bot başına kapı işlevi (yalnız SINIR kipinde ve demo kabul botu DEĞİLSE bağlanır — çağıran karar verir). Senkron, önbellekten.
   * Kip çağrı anında okunur: izlemeye dönülünce işlev bağlı kalsa bile null döner (çağıran ayrıca kancayı söker).
   * @returns (istek) → { engel } | null
   */
  kapiFn(botAd, grupFn) {
    return (istek) => {
      const a = this.ayar();
      if (a.kip !== 'sinir') return null;
      const grup = typeof grupFn === 'function' ? grupFn() : grupFn;
      if (grup !== SINIR_GRUP || dokunulmaz(grup, this.simdi())) return null;   // kâğıt / demo yalnız izlenir
      const r = kapiKarar({ olcum: this.son, ek: this.ek, grup, esikler: a.esikler, istek, simdi: this.simdi() });
      if (r.engel) {
        const anahtar = `${botAd}:${r.metrik || 'olcum'}`;
        const t = this.simdi();
        if (!this.engelSon[anahtar] || t - this.engelSon[anahtar] >= ENGEL_KISIT_MS) {
          this.engelSon[anahtar] = t;
          this.kaydet('WARN', `[TOPLAM RİSK] ${botAd}: ${r.engel}`);
          this._bildir('uyari', 'Toplam risk sınırı: emir verilmedi', [`${botAd} ${varlikAdi(istek && istek.symbol)} ${istek && istek.side === 'buy' ? 'alış' : 'satış'}: ${r.engel}`, 'Kip anında izlemeye döndürülebilir: Sistem › Sağlık › Toplam risk.'], `toplam-risk-engel:${anahtar}`, ENGEL_KISIT_MS);
        }
        return { engel: r.engel };
      }
      if (r.artis) {
        const e = this.ek[grup] || (this.ek[grup] = { brut: 0, btc: 0, varlik: {}, felaket: 0 });
        e.brut += r.artis.brut; e.btc += r.artis.btc; e.felaket += r.artis.felaket;
        for (const [k, v] of Object.entries(r.artis.varlik)) e.varlik[k] = (e.varlik[k] || 0) + v;
      }
      return null;
    };
  }

  /** Panel / uç durumu. */
  durum({ dagilimGun = IZLEME_GUN } = {}) {
    const simdi = this.simdi();
    const a = this.ayar();
    const kayitlar = this.oku(dagilimGun + 1);
    return {
      kip: a.kip, istenenKip: a.istenenKip, esikBozuk: a.esikBozuk, esikler: a.esikler, oneriEsikler: { ...ONERI_ESIKLER }, gecerliEsikler: a.gecerliEsikler, grupEsikleri: a.grupEsikleri, sinirGrup: SINIR_GRUP, onay: a.onay,
      izleme: izlemeBilgisi({ kip: a.kip, baslangic: a.baslangic, ilkKayit: this.ilkKayit, simdi }),
      son: this.son ? { zaman: new Date(this.son.zaman).toISOString(), gruplar: this.son.gruplar, asim: this.son.asim, esUyarilari: this.son.esUyarilari,
        botlar: this.son.botlar.map(b => ({ ...b, semboller: (b.semboller || []).slice(0, 8) })) } : null,
      dagilim: dagilim(kayitlar, { gun: dagilimGun, simdi }), kayitSayisi: kayitlar.length,
      metrikler: METRIKLER, gruplar: GRUP_AD, demoKorumaBitis: new Date(KORUMA_BITIS).toISOString(), felaketSok: FELAKET_SOK,
    };
  }
}

module.exports = {
  ToplamRisk, botOlc, olculemedi, toplamla, tekille, dagilim, esSatirlari, enKotuSatir, kapiKarar, izlemeBilgisi, ayarCoz, esikDogrula, dokunulmaz, varlikAdi,
  KIPLER, IZLEME_GUN, GRUPLAR, GRUP_AD, SINIR_GRUP, ONERI_ESIKLER, METRIKLER, FELAKET_SOK, ES_BAYAT_MS, KAYIT_ARALIK_MS, SINIR_OLCUM_MS, KAPI_BAYAT_MS, KORUMA_BITIS, DOSYA, ES_DOSYA,
};
