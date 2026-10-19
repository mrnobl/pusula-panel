/**
 * PORTFÖY VERİ YÜKLEYİCİ — PLAN-PORTFOY.md ön kaydı B.3 (tahvil), B.4 (TL mevduat), B.5 (TEFAS).
 * Veri: `node scripts/portfoy-veri-indir.js` → data/portfoy/   Öz test: `node scripts/portfoy-veri-selftest.js`
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KAYNAKLAR (ayrıntı ve ölçülmüş kısıtlar: scripts/portfoy-veri-indir.js başlığı)
 * ═══════════════════════════════════════════════════════════════════════════
 *  · TEFAS  POST https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir (anahtarsız; HARCAMA uygulamasındaki
 *           TefasApiService ile aynı gövde). ÖLÇÜLMÜŞ: başlangıç tarihi bugünden en çok 5 yıl geri ("Baslangıc Tarihi
 *           5 yıldan eski olamaz"), tek istek en çok ~1 ay, ~6 istek/dk (429). Eski /api/DB/BindHistory* uçları 404.
 *           → TEFAS serileri 2021-10-07'den başlar; ham aylar data/portfoy/tefas-ham/ altında saklanır (pencere her gün
 *           bir gün kaydığı için ham önbellek ASLA silinmemeli — silinen gün bir daha indirilemez).
 *  · TL mevduat  TCMB EVDS3 açık ön yüz ucu POST https://evds3.tcmb.gov.tr/igmevdsms-dis/fe (anahtarsız),
 *           TP.TRY.MT01 "1 Aya Kadar Vadeli (TL Mevduat, Akım, %)" haftalık (Cuma), 2005 →. Ağırlıklı ortalama, yeni açılan
 *           mevduat (akım). Politika faizi − makas vekiline GEREK KALMADI.
 *  · USDTRY  Yahoo v8 USDTRY=X kapanışı (data/portfoy/USDTRY_X.json; yoksa data/bist/USDTRY_X.json).
 *  · ABD tahvil  SHY / IEF / TLT — data/nasdaq (nasdaqVeri.duzeltilmis, adjclose = temettü dahil, USD).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * API
 * ═══════════════════════════════════════════════════════════════════════════
 * Saf yardımcılar (veri dosyası gerektirmez — öz test bunları sınar)
 *   tefasKategori(ad)            → 'para_piyasasi'|'altin'|'eurobond'|'yabanci_hisse'|'hisse'|'borclanma'|'degisken_katilim'
 *                                  | null (sınıflanamadı) | 'dislanan' (serbest / özel fon: genel yatırımcıya kapalı)
 *                                  Fon unvanındaki SPK tür ibaresine göre; kural sırası KATEGORI_KURALLARI'nda.
 *   altKategori(ad)              → 'degisken' | 'katilim' | null (değişken/katılım kategorisinin bilgi amaçlı ayrımı)
 *   temsilciSec(fonlar, {S, gecmisSiniri})
 *        fonlar = [{ kod, ad, kategori, ilk, son, buyuklukS }] (tarihler 'YYYY-MM-DD'); S = seçim (değerlendirme başı) günü.
 *        Kural (ÖN-KAYIT B.5): kategoride ilk ≤ gecmisSiniri (= S − 3 yıl; veri penceresi nedeniyle pratikte "S'den 3 yıl
 *        önceki veri başında zaten var") VE S'de fiyatı olan fonlar içinde S günü portföy büyüklüğü EN YÜKSEK olan.
 *        Getiriye bakılmaz. Eşitlikte kod sırası. → { kategori: { kod, buyukluk, adaylar:[{kod,buyukluk}], elenen:{...} } }
 *   stopajOrani(tarih)           → TL ≤ 6 ay vadeli mevduat stopajı (hesap açılış/yenileme günü; STOPAJ_TARIHCE)
 *   bolunmeDuzelt(gunler)        → { gunler, olaylar }  gunler = [{tarih, fiyat, pay?}]; |Δ| > %30 ve dolaşımdaki pay
 *        ters yönde aynı oranda (±%10) değişmişse bölünme/sıfırlama sayılır, önceki fiyatlar oranla ölçeklenir.
 *        Açıklanamayan |Δ| > %30 → olay { tur:'aciklanamayan' } (DÜZELTİLMEZ; denetimde raporlanır).
 *   haftaIciTakvim(basT, sonT)   → [t]  UTC gece yarısı, Pzt–Cum (ortak günlük takvim)
 *   ileriTasi(satirlar, takvim)  → Float64Array  satirlar=[{t, v}] artan; takvim gününde son bilinen v (yoksa NaN)
 *
 * Veri okuyucular (önbellekli)
 *   usdtry()                     → [{t, c}]  Yahoo kapanışı (gün = İstanbul takvim günü, UTC gece yarısı ms)
 *   tefasTemsilci()              → data/portfoy/tefas-temsilci.json (seçim kaydı: S, büyüklükler, adaylar, elenenler)
 *   tefasKatalog()               → data/portfoy/tefas-katalog.json (tüm fonların özeti: ad, kategori, ilk/son gün, büyüklük)
 *   tefasSeri(kod)               → [{t, tarih, fiyat, fiyatHam, buyukluk, kisi, pay}]  bölünmeye göre düzeltilmiş TL
 *   mevduatAylik()               → [{ay, t, oranYillik, oranTarihi, stopaj, gun, brutTL, netTL}]
 *        Her ayın 1'inde 1 aylık TL mevduat açılır/yenilenir: oran = ay başından ÖNCEKİ son haftalık MT01 gözlemi;
 *        brüt = oran × gün/365 (basit faiz), net = brüt × (1 − stopaj(ayın 1'i)). Faiz anapara ile birlikte yenilenir.
 *   kolSerileri({ siklik: 'gunluk'|'aylik', kollar?, kismiAy?, tefasHizalama?: 'degerleme'|'islem' })
 *        → { siklik, seriler: { kol: [{t, getiriUSD}] }, baslangic: { kol: 'YYYY-MM-DD' }, bitis: 'YYYY-MM-DD',
 *            takvim: [t], kaynak: { kol: açıklama } }
 *        Kollar: ABD_SHY, ABD_IEF, ABD_TLT, TL_MEVDUAT, TEFAS_<kategori> (her kategori için temsilci fon).
 *          TR devlet tahvili vekili = TEFAS_borclanma · TR Eurobond vekili = TEFAS_eurobond.
 *        GÜNLÜK: ortak takvim = Pzt–Cum günleri, [en erken kol başı, kolların ORTAK son günü]. Her kolun USD seviyesi
 *          o takvim gününde son bilinen değerle ileri taşınır (ABD tatilinde ABD kolu, TR tatilinde TEFAS kolu 0 TL
 *          getirili — ama kur oynadıysa TL kolun USD getirisi 0 DEĞİL, doğru olan da bu). getiriUSD(d) = L(d)/L(d−1) − 1;
 *          kolun ilk günü getirisi yazılmaz (seri ikinci günden başlar), baslangic = ilk seviye günü.
 *        AYLIK: ay sonu seviyesi = ayın son takvim (Pzt–Cum) gününde ileri taşınmış seviye. t = ayın 1'i (UTC),
 *          getiriUSD = L(ay sonu) / L(önceki ay sonu) − 1. Tamamlanmamış son ay atlanır (ops.kismiAy: true ile dahil).
 *        KUR HİZALAMA (TL kollar): USD seviye(d) = TL değer(d) / USDTRY(d); ikisi de d gününde ya da öncesinde son bilinen
 *          değer (ileri taşıma). Yahoo kur günü = İstanbul takvim günü (FX kapanışı ~Londra akşamı).
 *          TEFAS `tarih` = fiyatın İŞLEM günü; fiyat ise bir önceki işlem gününün piyasa kapanışından hesaplanır —
 *          ÖLÇÜLDÜ (_denetim.json kurGecikmeTesti: hisse temsilcisi YAS ↔ XU100 korelasyonu gecikme 0: 0,04, gecikme 1: 0,90).
 *          Bu yüzden VARSAYILAN tefasHizalama='degerleme': D tarihli fiyat fonun önceki fiyat gününe (değerleme günü) yazılır
 *          ve o günün kuruyla bölünür (USD σ dört temsilcide de düşüyor: YBE 9,21→8,86, TI1 7,29→7,00 — 2023+ yıllık).
 *          'islem' = fiyat kendi tarihinde, aynı gün kuruyla (yatırımcının o gün satıp TL'yi bozdurduğu değer). Aylık
 *          sıklıkta fark ay sonu bir günlük kaymadır.
 *        TL_MEVDUAT günlük: TL seviyesi ay içinde basit faizle takvim günü başına doğrusal birikir, ay sonunda bileşir
 *          (aylık getirilerle birebir tutarlı).
 *
 * BİLİNEN SINIRLAR
 *   · TEFAS 2021-10-07 öncesi YOK (ucun 5 yıl sınırı) → uzun pencerede (2014 →) TEFAS kolları kullanılamaz.
 *   · Temsilci S = veri başı + 3 yıl (2024-10) seçildi: "≥ 3 yıl geçmiş" ancak böyle ölçülebiliyor (bkz. kayıt).
 *     2021-10 → S arasında fonun hayatta kaldığı BİLİNEREK seçildi → bu aralık yalnız ısınma (ağırlık tahmini) içindir.
 *   · Fon ücretleri fiyata gömülü; fon stopajı (ve mevduat dışı vergiler) DÜŞÜLMEDİ — not edilir.
 *   · Mevduat oranı piyasa ortalaması (akım): büyük/küçük tutara göre bankada fark olur.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const zlib = require('zlib');

const GUN = 864e5;
const DIR = yollar.veri('portfoy');
const YOL = {
  hamDir: path.join(DIR, 'tefas-ham'),
  fonDir: path.join(DIR, 'tefas'),
  katalog: path.join(DIR, 'tefas-katalog.json'),
  temsilci: path.join(DIR, 'tefas-temsilci.json'),
  evds: path.join(DIR, 'evds-mevduat.json'),
  usdtry: path.join(DIR, 'USDTRY_X.json'),
  usdtryYedek: yollar.veri('bist', 'USDTRY_X.json'),
  denetim: path.join(DIR, '_denetim.json'),
};

const tarihT = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const tStr = t => new Date(t).toISOString().slice(0, 10);
const ayAnahtar = t => new Date(t).toISOString().slice(0, 7);

// ── TEFAS kategori sınıflaması ───────────────────────────────────────────────
// Fon unvanındaki SPK tür ibaresi (Yatırım Fonlarına İlişkin Esaslar Tebliği, III-52.1: unvanda fon türü yer alır).
// Sıra önemlidir: ilk eşleşen kazanır. 'dislanan' = serbest fon / özel fon (nitelikli ya da belirli yatırımcıya; genel
// yatırımcı alamaz). Büyük harf + Türkçe İ/Ş/Ğ/Ü/Ö/Ç ile karşılaştırılır.
const KATEGORI_ADLARI = {
  para_piyasasi: 'Para piyasası', altin: 'Altın / kıymetli maden', eurobond: 'Eurobond (TR dış borç, döviz)',
  yabanci_hisse: 'Yabancı hisse', hisse: 'Hisse senedi (BIST)', borclanma: 'Borçlanma araçları (TL; TR devlet tahvili vekili)',
  degisken_katilim: 'Değişken / katılım',
};
const KATEGORI_KURALLARI = [
  ['dislanan', a => /SERBEST|ÖZEL FON/.test(a)],
  ['para_piyasasi', a => /PARA PİYASASI/.test(a)],
  ['altin', a => /ALTIN|KIYMETLİ MADEN/.test(a)],
  ['eurobond', a => /EUROBOND|DIŞ BORÇLANMA/.test(a)],
  ['yabanci_hisse', a => /YABANCI/.test(a) && /HİSSE/.test(a)],
  ['hisse', a => /HİSSE/.test(a) && !/YABANCI|DÖVİZ/.test(a)],
  // TR devlet tahvili vekili: genel/orta/uzun vadeli TL borçlanma araçları. Kısa vadeli (para piyasasına yakın, ayrı SPK
  // türü), özel sektör, döviz/yabancı, kira sertifikası (katılım) ve fon sepetleri dışarıda.
  ['borclanma', a => /BORÇLANMA ARAÇLARI/.test(a) && !/KISA VADELİ|ÖZEL SEKTÖR|DÖVİZ|YABANCI|DOLAR|EURO|KİRA SERTİFİKA|FON SEPETİ/.test(a)],
  ['degisken_katilim', a => /DEĞİŞKEN|KATILIM/.test(a)],
];
const buyukHarf = s => String(s || '').replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase().replace(/\s+/g, ' ').trim();
function tefasKategori(ad) {
  const a = buyukHarf(ad);
  for (const [k, f] of KATEGORI_KURALLARI) if (f(a)) return k;
  return null;
}
function altKategori(ad) {
  const a = buyukHarf(ad);
  if (tefasKategori(a) !== 'degisken_katilim') return null;
  return /DEĞİŞKEN/.test(a) ? 'degisken' : 'katilim';
}

// ── Temsilci seçimi (ÖN-KAYIT B.5) ───────────────────────────────────────────
function temsilciSec(fonlar, { S, gecmisSiniri }) {
  const out = {};
  for (const k of Object.keys(KATEGORI_ADLARI)) {
    const kat = fonlar.filter(f => f.kategori === k);
    const elenen = { gecmisKisa: [], Sde_yok: [] };
    const uygun = [];
    for (const f of kat) {
      if (f.ilk > gecmisSiniri) { elenen.gecmisKisa.push(f.kod); continue; }
      if (!(f.buyuklukS > 0)) { elenen.Sde_yok.push(f.kod); continue; }
      uygun.push(f);
    }
    uygun.sort((a, b) => (b.buyuklukS - a.buyuklukS) || (a.kod < b.kod ? -1 : 1));
    out[k] = {
      ad: KATEGORI_ADLARI[k],
      kod: uygun.length ? uygun[0].kod : null,
      fonAd: uygun.length ? uygun[0].ad : null,
      buyukluk: uygun.length ? uygun[0].buyuklukS : null,
      adaylar: uygun.slice(0, 10).map(f => ({ kod: f.kod, ad: f.ad, buyukluk: f.buyuklukS, ilk: f.ilk })),
      uygunSayisi: uygun.length, kategoriSayisi: kat.length,
      elenen: { gecmisKisa: elenen.gecmisKisa.length, Sde_yok: elenen.Sde_yok.sort() },
    };
  }
  return out;
}

// ── Mevduat stopajı tarihçesi (TL, vadesiz ve 6 aya kadar vadeli; hesap açılış/yenileme gününe göre) ─────────
// Temel: GVK geçici 67 + 2006/10731 sayılı BKK (22.07.2006): ≤ 6 ay %15, ≤ 1 yıl %12, > 1 yıl %10.
const STOPAJ_TARIHCE = [
  { bas: '2006-07-23', oran: 0.15, kaynak: '2006/10731 BKK (RG 23.07.2006) — ≤6 ay %15' },
  { bas: '2018-08-31', oran: 0.05, kaynak: 'CK 53 (RG 31.08.2018) %15→%5 geçici; uzatmalarla 30.04.2019\'a dek (ara uzatma karar numaraları doğrulanmadı)' },
  { bas: '2019-05-01', oran: 0.15, kaynak: 'CK 1015 (RG 30.04.2019) — 01.05.2019\'dan itibaren ≤6 ay %15 (TÜRMOB 02.05.2019/96-1)' },
  { bas: '2020-09-30', oran: 0.05, kaynak: 'CK 3032 (RG 30.09.2020) %15→%5; 2021/2022/2023 boyunca uzatıldı (Hürriyet 01.10.2021, 28.06.2022)' },
  { bas: '2024-05-01', oran: 0.075, kaynak: 'CK 8434 (RG 01.05.2024) %5→%7,5; CK 8775 (RG 01.08.2024) ile 31.10.2024\'e dek' },
  { bas: '2024-11-01', oran: 0.10, kaynak: 'CK 9075 (RG 01.11.2024) %10' },
  { bas: '2025-02-01', oran: 0.15, kaynak: 'CK 9487 (RG 01.02.2025) %15' },
  { bas: '2025-07-09', oran: 0.175, kaynak: 'CK 10041 (RG 09.07.2025) %15→%17,5' },
];
function stopajOrani(tarih) {
  const s = typeof tarih === 'number' ? tStr(tarih) : tarih;
  if (s < STOPAJ_TARIHCE[0].bas) return null;
  let o = null;
  for (const x of STOPAJ_TARIHCE) if (x.bas <= s) o = x.oran;
  return o;
}

// ── Bölünme / sıfırlama düzeltmesi ───────────────────────────────────────────
function bolunmeDuzelt(gunler, { esik = 0.30, payTolerans = 0.10 } = {}) {
  const olaylar = [];
  const carpan = new Array(gunler.length).fill(1);
  for (let i = 1; i < gunler.length; i++) {
    const a = gunler[i - 1], b = gunler[i];
    const r = b.fiyat / a.fiyat;
    if (Math.abs(r - 1) <= esik) continue;
    const payOran = (a.pay > 0 && b.pay > 0) ? b.pay / a.pay : null;
    const aciklanir = payOran != null && Math.abs(payOran * r - 1) <= payTolerans;
    olaylar.push({ tarih: b.tarih, onceki: a.tarih, oran: +r.toPrecision(6), payOran: payOran == null ? null : +payOran.toPrecision(6),
      tur: aciklanir ? 'bolunme' : 'aciklanamayan' });
    if (aciklanir) for (let j = 0; j < i; j++) carpan[j] *= r;
  }
  return { gunler: gunler.map((g, i) => ({ ...g, fiyatHam: g.fiyat, fiyat: g.fiyat * carpan[i] })), olaylar };
}

// ── Takvim / hizalama ────────────────────────────────────────────────────────
function haftaIciTakvim(basT, sonT) {
  const out = [];
  for (let t = basT; t <= sonT; t += GUN) { const g = new Date(t).getUTCDay(); if (g !== 0 && g !== 6) out.push(t); }
  return out;
}
function ileriTasi(satirlar, takvim) {
  const out = new Float64Array(takvim.length).fill(NaN);
  let j = 0, son = NaN;
  for (let d = 0; d < takvim.length; d++) {
    while (j < satirlar.length && satirlar[j].t <= takvim[d]) { son = satirlar[j].v; j++; }
    out[d] = son;
  }
  return out;
}

// ── Okuyucular ───────────────────────────────────────────────────────────────
const _o = new Map();
const onbellek = (k, f) => { if (!_o.has(k)) _o.set(k, f()); return _o.get(k); };
const jsonOku = (p, ipucu) => {
  if (!fs.existsSync(p)) throw new Error(`portfoyVeri: ${p} yok — önce ${ipucu || 'node scripts/portfoy-veri-indir.js'}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

function usdtry() {
  return onbellek('usdtry', () => {
    const p = fs.existsSync(YOL.usdtry) ? YOL.usdtry : YOL.usdtryYedek;
    const j = jsonOku(p);
    return j.gunler.filter(x => x.c > 0).map(x => ({ t: x.t, c: x.c }));
  });
}
const tefasTemsilci = () => onbellek('temsilci', () => jsonOku(YOL.temsilci));
const tefasKatalog = () => onbellek('katalog', () => jsonOku(YOL.katalog));

function tefasSeri(kod) {
  return onbellek('fon:' + kod, () => {
    const j = jsonOku(path.join(YOL.fonDir, kod + '.json'));
    const ham = j.gunler.map(([tarih, fiyat, buyukluk, kisi, pay]) => ({ tarih, fiyat, buyukluk, kisi, pay }))
      .filter(x => x.fiyat > 0);
    const { gunler } = bolunmeDuzelt(ham);
    return gunler.map(g => ({ t: tarihT(g.tarih), ...g }));
  });
}

function mevduatAylik() {
  return onbellek('mevduat', () => {
    const j = jsonOku(YOL.evds);
    const haftalik = j.MT01.map(x => ({ t: tarihT(x.tarih), tarih: x.tarih, oran: x.oran })).filter(x => x.oran > 0);
    if (!haftalik.length) throw new Error('portfoyVeri: MT01 boş');
    const out = [];
    const ilk = new Date(haftalik[0].t);
    let y = ilk.getUTCFullYear(), m = ilk.getUTCMonth() + 1; // ilk gözlemden sonraki ay
    const sonAy = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
    let k = 0;
    for (;;) {
      const t = Date.UTC(y, m, 1);
      if (t > sonAy) break;
      while (k + 1 < haftalik.length && haftalik[k + 1].t < t) k++;
      const ob = haftalik[k];
      const stop = stopajOrani(t);
      // Gözlem ay başından en çok 21 gün önce olmalı (yayın gecikmesi / boşluk koruması).
      if (ob.t < t && t - ob.t <= 21 * GUN && stop != null) {
        const sonraki = Date.UTC(y, m + 1, 1), gun = Math.round((sonraki - t) / GUN);
        const brut = ob.oran / 100 * gun / 365;
        out.push({ ay: ayAnahtar(t), t, oranYillik: ob.oran, oranTarihi: ob.tarih, stopaj: stop, gun, brutTL: brut, netTL: brut * (1 - stop) });
      }
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  });
}

// ── Kol seviyeleri (her kol: [{t, v}] artan; v = USD seviye) ─────────────────
const ABD = ['SHY', 'IEF', 'TLT'];
function kolTanimlari() {
  const k = {};
  for (const s of ABD) k['ABD_' + s] = { kaynak: `Yahoo ${s} adjclose (USD, temettü dahil) — data/nasdaq`, tur: 'abd', s };
  k.TL_MEVDUAT = { kaynak: 'TCMB EVDS TP.TRY.MT01 (1 aya kadar vadeli TL, akım) − stopaj, aylık yenileme, /USDTRY', tur: 'mevduat' };
  let tem = null;
  try { tem = tefasTemsilci(); } catch (e) { tem = null; }
  if (tem) for (const [kat, x] of Object.entries(tem.temsilciler)) {
    if (x.kod) k['TEFAS_' + kat] = { kaynak: `TEFAS ${x.kod} (${x.fonAd}) TL fiyat / USDTRY; temsilci seçimi ${tem.S}`, tur: 'tefas', kod: x.kod };
  }
  return k;
}

function kurlu(satirlarTL) {
  // TL seviye → USD seviye; her satır gününde kur = o gün ya da öncesi son kapanış.
  const kur = usdtry();
  const out = [];
  let j = 0, sonKur = NaN;
  for (const x of satirlarTL) {
    while (j < kur.length && kur[j].t <= x.t) { sonKur = kur[j].c; j++; }
    if (sonKur > 0) out.push({ t: x.t, v: x.v / sonKur });
  }
  return out;
}

function mevduatTLGunluk(takvim) {
  // Takvim günlerinde TL seviye (1'den başlar); ay içinde basit faiz takvim günüyle doğrusal.
  // Aylar ardışık olmalı; ilk boşlukta seri biter (uydurma yok).
  const ay = mevduatAylik();
  const ayBasiSeviye = new Map();
  let sev = 1;
  for (let i = 0; i < ay.length; i++) {
    if (i && ay[i].t !== Date.UTC(new Date(ay[i - 1].t).getUTCFullYear(), new Date(ay[i - 1].t).getUTCMonth() + 1, 1)) break;
    ayBasiSeviye.set(ay[i].t, { sev, a: ay[i] });
    sev *= 1 + ay[i].netTL;
  }
  const out = [];
  for (const t of takvim) {
    const d = new Date(t), aT = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const x = ayBasiSeviye.get(aT);
    if (!x) { if (out.length) break; continue; }
    const gecen = (t - aT) / GUN; // ay 1'i = 0 gün; ayın son günü = gun − 1 → kalan 1 gün sonraki ayın 1'inde bileşir
    out.push({ t, v: x.sev * (1 + x.a.netTL * gecen / x.a.gun) });
  }
  return out;
}

function kolSeviye(ad, tanim, takvimTum, hizalama = 'degerleme') {
  if (tanim.tur === 'abd') {
    const nv = require('./nasdaqVeri');
    return nv.duzeltilmis(tanim.s).map(x => ({ t: x.t, v: x.c }));
  }
  if (tanim.tur === 'tefas') {
    const f = tefasSeri(tanim.kod);
    if (hizalama === 'islem') return kurlu(f.map(x => ({ t: x.t, v: x.fiyat })));
    // 'degerleme' (varsayılan): D tarihli fiyat, fonun bir önceki TEFAS fiyat gününün (D−1 değerleme günü) piyasa
    // kapanışını yansıtır (_denetim.json kurGecikmeTesti) → fiyat o güne yazılır ve O GÜNÜN kuruyla USD'ye çevrilir.
    const out = [];
    for (let i = 1; i < f.length; i++) out.push({ t: f[i - 1].t, v: f[i].fiyat });
    return kurlu(out);
  }
  if (tanim.tur === 'mevduat') {
    // Takvim günü başına (hafta sonu dahil) TL seviye; ay sonu bileşimi için her gün gerekir.
    const ilkAy = mevduatAylik()[0].t;
    const gunler = [];
    for (let t = ilkAy; t <= takvimTum; t += GUN) gunler.push(t);
    return kurlu(mevduatTLGunluk(gunler));
  }
  throw new Error('portfoyVeri: bilinmeyen kol ' + ad);
}

function kolSerileri(ops = {}) {
  const siklik = ops.siklik || 'aylik';
  if (ops.tefasHizalama && !['degerleme', 'islem'].includes(ops.tefasHizalama)) throw new Error("portfoyVeri: tefasHizalama 'degerleme' | 'islem'");
  if (siklik !== 'gunluk' && siklik !== 'aylik') throw new Error("portfoyVeri: siklik 'gunluk' | 'aylik'");
  const tanim = kolTanimlari();
  const adlar = ops.kollar || Object.keys(tanim);
  const bugun = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const seviyeler = {};
  for (const a of adlar) {
    if (!tanim[a]) throw new Error(`portfoyVeri: kol yok: ${a} (var olanlar: ${Object.keys(tanim).join(', ')})`);
    seviyeler[a] = kolSeviye(a, tanim[a], bugun, ops.tefasHizalama || 'degerleme').filter(x => x.v > 0 && Number.isFinite(x.v));
  }
  // Mevduatın "son günü" kurla sınırlı (seviye her takvim günü üretildiği için) — kurun son günü.
  const kurSon = usdtry()[usdtry().length - 1].t;
  const sonGun = a => Math.min(seviyeler[a][seviyeler[a].length - 1].t, tanim[a].tur === 'abd' ? Infinity : kurSon);
  const bas = Math.min(...adlar.map(a => seviyeler[a][0].t));
  const son = Math.min(...adlar.map(sonGun));
  const takvim = haftaIciTakvim(bas, son);
  const seriler = {}, baslangic = {}, kaynak = {};
  for (const a of adlar) {
    const L = ileriTasi(seviyeler[a], takvim);
    kaynak[a] = tanim[a].kaynak;
    if (siklik === 'gunluk') {
      const s = [];
      let ilk = null;
      for (let d = 1; d < takvim.length; d++) {
        if (!(L[d - 1] > 0)) continue;
        if (ilk == null) ilk = takvim[d - 1];
        s.push({ t: takvim[d], getiriUSD: L[d] / L[d - 1] - 1 });
      }
      seriler[a] = s; baslangic[a] = ilk == null ? null : tStr(ilk);
    } else {
      // Ay sonu: takvimde ayın son günü.
      const aySonIdx = [];
      for (let d = 0; d < takvim.length; d++) {
        const sonMu = d === takvim.length - 1 || ayAnahtar(takvim[d + 1]) !== ayAnahtar(takvim[d]);
        if (sonMu) aySonIdx.push(d);
      }
      const s = [];
      let ilk = null;
      for (let i = 1; i < aySonIdx.length; i++) {
        const d0 = aySonIdx[i - 1], d1 = aySonIdx[i];
        const tAy = takvim[d1], dd = new Date(tAy);
        const tamMi = haftaIciTakvim(tAy + GUN, Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 0)).length === 0;
        if (!tamMi && !ops.kismiAy) continue;
        if (!(L[d0] > 0) || !(L[d1] > 0)) continue;
        // Kolun kendi ilk gözlemi önceki ay sonundan sonra ise (ileri taşıma olmaz) zaten L[d0] NaN.
        if (ilk == null) ilk = takvim[d0];
        s.push({ t: Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), 1), ay: ayAnahtar(tAy), getiriUSD: L[d1] / L[d0] - 1 });
      }
      seriler[a] = s; baslangic[a] = ilk == null ? null : tStr(ilk);
    }
  }
  return { siklik, tefasHizalama: ops.tefasHizalama || 'degerleme', seriler, baslangic, bitis: tStr(son), takvim, kaynak };
}

// ── Ham TEFAS ay dosyaları (indirici ve denetim kullanır) ─────────────────────
function hamAyOku(dosya) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(dosya)).toString('utf8'));
}
function hamAylar() {
  if (!fs.existsSync(YOL.hamDir)) return [];
  return fs.readdirSync(YOL.hamDir).filter(f => /^\d{4}-\d{2}\.json\.gz$/.test(f)).sort().map(f => path.join(YOL.hamDir, f));
}

module.exports = {
  // saf
  tefasKategori, altKategori, temsilciSec, stopajOrani, bolunmeDuzelt, haftaIciTakvim, ileriTasi,
  KATEGORI_ADLARI, KATEGORI_KURALLARI, STOPAJ_TARIHCE, buyukHarf,
  // okuyucular
  usdtry, tefasTemsilci, tefasKatalog, tefasSeri, mevduatAylik, kolSerileri, kolTanimlari,
  hamAyOku, hamAylar,
  // lib/portfoy (katalog/seri katmanı) için: TL seviye yardımcıları ve önbellek tazeleme (indirme sonrası)
  mevduatTLGunluk, kurlu, onbellekTemizle: () => _o.clear(),
  // yardımcı
  GUN, DIR, YOL, tarihT, tStr, ayAnahtar,
};
