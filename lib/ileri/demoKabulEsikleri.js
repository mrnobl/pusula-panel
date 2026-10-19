/**
 * DEMO KABUL EŞİKLERİ — TEK KAYNAK (DONDURULMUŞ).
 * Değerler PLAN-DEMO-KABUL.md ÖN-KAYIT (2026-10-07) §1, §3 ve §4 tablolarından AYNEN alındı; plan bölümü değişmez,
 * bu dosya da değişmez (hucumDengeEsikleri.js örüntüsü). `scripts/demo-kabul-selftest.js` buradaki sayıların plan
 * metnindeki tablolarla aynı olduğunu denetler — biri değişirse test kırılır.
 *
 * Birimler: oranlar ondalık (0,03 = %3), maliyet bp, süre gün/dakika. Bantlar (§3) yüzde metinden ondalığa çevrildi.
 * "Açıklanmış" olay = prova günlüğündeki `aciklamalar` listesinde nedeni yazılmış dış olay (kod hatası değil).
 */
const GUN0_TABAN = '2026-10-07';

/** §1 aşamaları. */
const ASAMALAR = Object.freeze({ ara: 30, hukum: 63, uzatma: 126, izleme: 252 });

/** §4 eşikleri (63 g penceresi; prova aralıkları hariç). */
const ESIK = Object.freeze({
  U1: Object.freeze({ pencereGun: 30, gecti: 0.03, incele: 0.05 }),            // her pencerede ≤ %3 · %3–5 İNCELE · > %5 → U2'ye bakılır
  U2: Object.freeze({ gecti: 0.03, incele: 0.05 }),                            // ≤ %3 · %3–5 (ya da U1 > %5 iken U2 ≤ %5) · > %5 GEÇMEDİ
  U3: Object.freeze({ gunFarkPuan: 0.02, inceleGun: 1, gecmediGun: 3 }),      // |fark| > 2 puan gün: 0 · 1–2 · ≥ 3
  U4: Object.freeze({ asgariDolum: 30, modelBp: 7, gectiBp: 10.5, inceleBp: 14 }), // ≤ 10,5 · 10,5–14 · > 14 bp
  U5: Object.freeze({ gectiBp: 5.0 }),                                         // ≤ 5,0 bp · > 5,0 İNCELE
  U6: Object.freeze({ gecti: 0 }),                                             // yabancı funding: 0 · açıklanmış ≥ 1 · açıklanamayan ≥ 1
  U8: Object.freeze({ rejimKat: 2, ayBasiKat: 1.5 }),                          // ≤ 2 × diğer dolumlar · ay başı ≤ 1,5 ×
  I1: Object.freeze({ gecti: 0 }),                                             // uyuşmazlık / BİLİNMİYOR / defter↔borsa / çift emir
  I2: Object.freeze({ gecti: 0, inceleAciklanmis: 1, gecmedi: 2 }),            // 0 · 1 açıklanmış · ≥ 2 ya da açıklanamayan 1
  I3a: Object.freeze({ gecti: 0, incele: 1, gecmedi: 2 }),                     // açıklanamayan hata alarmı 0 · 1 · ≥ 2
  I3b: Object.freeze({ gecti: 5, incele: 10 }),                                // açıklanmış hata alarmı ≤ 5 · 6–10 · > 10
  I4a: Object.freeze({ gecti: 0.98, incele: 0.95, korumasizSaat: 24 }),        // ≥ %98 · %95–98 (≤ 24 sa) · < %95 ya da > 24 sa
  I4b: Object.freeze({ gecti: 0 }),                                            // stop kayboldu: 0 · 1 açıklanmış · açıklanamayan ≥ 1
  I5: Object.freeze({ uyari: 0.5, alarm: 0.8 }),                               // < %50 · %50–80 · ≥ %80 (marjIzleme.ESIK ile aynı)
  I6: Object.freeze({ gecti: 3, incele: 6, temizPencereGun: 30 }),             // ≤ 3 VE bir 30 g aralık 0 · 4–6 · > 6
  I7: Object.freeze({ basDk: 2, bitDk: 30, gecti: 0.90, incele: 0.75 }),       // 00:02–00:30 UTC günlerin ≥ %90 · %75–90 · < %75
  I8: Object.freeze({ gecti: 0, incele: 2, gecmedi: 3 }),                      // 0 · 1–2 · ≥ 3
  I9: Object.freeze({ gecti: 0.05, incele: 0.20 }),                            // ≤ %5 · %5–20 · > %20
});

/**
 * §3 blok bootstrap kabul bantları (b taramasının en genişi). getiri p5, MaxDD p95 / p99, vol p5 / p95 (yıllık).
 * Plan tablosu: "| 63 g | −%26,6 / **−%18,3** | … | **%26,5 / %33,8** | %10,7 – %80,0 | …".
 */
const BANT = Object.freeze({
  hucum: Object.freeze({
    63: Object.freeze({ getiriP5: -0.183, maxddP95: 0.265, maxddP99: 0.338, volP5: 0.107, volP95: 0.800 }),
    126: Object.freeze({ getiriP5: -0.212, maxddP95: 0.336, maxddP99: 0.421, volP5: 0.173, volP95: 0.736 }),
    252: Object.freeze({ getiriP5: -0.223, maxddP95: 0.418, maxddP99: 0.504, volP5: 0.254, volP95: 0.680 }),
  }),
  denge: Object.freeze({
    63: Object.freeze({ getiriP5: -0.109, maxddP95: 0.175, maxddP99: 0.227, volP5: 0.105, volP95: 0.546 }),
    126: Object.freeze({ getiriP5: -0.116, maxddP95: 0.224, maxddP99: 0.280, volP5: 0.152, volP95: 0.487 }),
    252: Object.freeze({ getiriP5: -0.114, maxddP95: 0.279, maxddP99: 0.342, volP5: 0.191, volP95: 0.446 }),
  }),
});

/** Hüküm değerleri. */
const HUKUM = Object.freeze({ GECTI: 'GEÇTİ', INCELE: 'İNCELE', GECMEDI: 'GEÇMEDİ', OLCULEMEDI: 'ÖLÇÜLEMEDİ' });

/** Birincil ölçütler (§4 genel hüküm: U1–U8, I1–I9). G1 ikincil (yalnız MaxDD > p99 GEÇMEDİ). */
const BIRINCIL = Object.freeze(['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U8a', 'U8b', 'I1', 'I2', 'I3a', 'I3b', 'I4a', 'I4b', 'I4c', 'I5', 'I6', 'I7', 'I8', 'I9']);

/** §5 provaları (5 = acil durdurma denemesi 63. günden SONRA; 6 isteğe bağlı). */
const PROVALAR = Object.freeze([
  Object.freeze({ no: 1, ad: 'Felaket stopu tatbikatı', zorunlu: true, olcut: 'I4' }),
  Object.freeze({ no: 2, ad: 'Çökme / yeniden başlatma', zorunlu: true, olcut: 'I8' }),
  Object.freeze({ no: 3, ad: 'İnternet kesintisi', zorunlu: true, olcut: 'I6' }),
  Object.freeze({ no: 4, ad: 'Bilgisayar kapalı (kaçırılan gün)', zorunlu: true, olcut: 'I6' }),
  Object.freeze({ no: 5, ad: 'Acil durdurma denemesi', zorunlu: true, olcut: 'I1', sonra: 63 }),
  Object.freeze({ no: 6, ad: 'Mutabakat provası', zorunlu: false, olcut: 'I1' }),
]);

module.exports = { PLAN: 'PLAN-DEMO-KABUL.md', GUN0_TABAN, ASAMALAR, ESIK, BANT, HUKUM, BIRINCIL, PROVALAR };
