'use strict';
/**
 * PİYASA BAĞLAMI — OLAY TAKVİMİ (73.9, SAF; ağ yok). Öz test: scripts/piyasa-baglami-selftest.js
 * ═══════════════════════════════════════════════════════════════════════════
 *   fomc     FOMC faiz kararı — federalreserve.gov takvimi (sunucu ayda bir tazeler) ⊕ depodaki statik liste
 *            kayitlar/qqq-ay-donumu/fomc-tarihleri.json. Açıklama 14:00 New York (TR 21:00 ya da 22:00).
 *   tufe-abd ABD TÜFE — FRED yayın takvimi (rid=10, BLS'nin kendi takvimi; saatler Chicago saatiyle, 07:30 CT = 08:30 ET).
 *   tufe-tr  Türkiye TÜFE — KURAL (tahmini): TÜİK ayın 3'ü 10:00 İstanbul; 3'ü cumartesi/pazar ise pazartesi. Resmî takvim otomatik
 *            okunmuyor (TÜİK takvim sayfası makine okunur değil) — kartta "tahmini" yazar.
 *   bilanco  BIST bilanço son günleri — SPK II-14.1 md. 10 yasal süreleri (tahmini; tatil kaydırması uygulanmaz): 3/9 aylık 30 gün
 *            (konsolide 40), 6 aylık 50 gün (konsolide 60; sınırlı denetimli), yıllık 60 gün (konsolide 70). Açıklanan bilançoların
 *            ÖZETİ 73.6 bilanço bildirimindedir — burada yalnız takvim.
 *   kilit    Coin kilit açılımları — OTOMATİK ÜCRETSİZ KAYNAK YOK (Tokenomist otomatik erişimi yasaklıyor, API ücretli; DefiLlama
 *            /emissions ücretli → 402). Yalnız elle: <veri>/piyasa-olaylar.json [{ gun, saat?, baslik, tur: 'kilit' | 'diger', not? }].
 * Her olay: { kimlik, tur, gun (İstanbul günü), zaman (UTC ms), baslik, ayrinti, kaynak, tahmini }.
 */
const O = require('../veri/orkestrator');

const GUN = 864e5;
const pad = (n) => String(n).padStart(2, '0');
const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUN_AD = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** UTC ms → İstanbul { gun: 'YYYY-MM-DD', saat: 'HH:MM', haftaGunu: 0=Pazar }. */
function ist(t) { const y = O.yerel(t, 'Europe/Istanbul'); return { gun: `${y.y}-${pad(y.a)}-${pad(y.g)}`, saat: `${pad(y.s)}:${pad(y.dk)}`, haftaGunu: y.hg }; }
const ayAdi = (ay) => { const m = /^(\d{4})-(\d{2})$/.exec(ay || ''); return m ? `${AY_AD[+m[2] - 1]} ${m[1]}` : ay; };
const oncekiAy = (y, a) => (a === 1 ? `${y - 1}-12` : `${y}-${pad(a - 1)}`);

function fomcOlaylari(liste) {
  return (liste || []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.gun)).map(x => {
    const [y, a, g] = x.gun.split('-').map(Number);
    const zaman = O.yereldenUtc(y, a, g, 14, 0, 'America/New_York');
    return { kimlik: `fomc-${x.gun}`, tur: 'fomc', gun: ist(zaman).gun, zaman, baslik: `FOMC faiz kararı${x.sep ? ' (projeksiyonlu)' : ''}`,
      ayrinti: `Açıklama ${ist(zaman).saat} (TR), basın toplantısı 30 dk sonra`, kaynak: 'federalreserve.gov FOMC takvimi', tahmini: false };
  });
}

function abdTufeOlaylari(liste) {
  return (liste || []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.gun)).map(x => {
    const [y, a, g] = x.gun.split('-').map(Number);
    const [s, dk] = (/^\d{2}:\d{2}$/.test(x.saat || '') ? x.saat : '07:30').split(':').map(Number);
    const zaman = O.yereldenUtc(y, a, g, s, dk, 'America/Chicago');
    const ay = oncekiAy(y, a);
    return { kimlik: `tufe-abd-${ay}`, tur: 'tufe-abd', gun: ist(zaman).gun, zaman, ay, baslik: `ABD TÜFE (${ayAdi(ay)})`, ayrinti: `Açıklama ${ist(zaman).saat} (TR) · BLS`,
      kaynak: 'FRED yayın takvimi (Consumer Price Index, rid=10)', tahmini: false };
  });
}

/** Türkiye TÜFE: bas..bit aralığındaki ayların kural tarihi. */
function trTufeOlaylari(bas, bit) {
  const out = [];
  const b = O.yerel(bas, 'Europe/Istanbul');
  for (let i = -1; i <= 14; i++) {
    const d = new Date(Date.UTC(b.y, b.a - 1 + i, 3));
    let y = d.getUTCFullYear(), a = d.getUTCMonth() + 1, g = 3;
    const hg = new Date(Date.UTC(y, a - 1, g)).getUTCDay();
    if (hg === 6) g += 2; else if (hg === 0) g += 1;
    const zaman = O.yereldenUtc(y, a, g, 10, 0, 'Europe/Istanbul');
    if (zaman < bas - 40 * GUN || zaman > bit) continue;
    const ay = oncekiAy(y, a);
    out.push({ kimlik: `tufe-tr-${ay}`, tur: 'tufe-tr', gun: `${y}-${pad(a)}-${pad(g)}`, zaman, ay, baslik: `Türkiye TÜFE (${ayAdi(ay)})`, ayrinti: 'TÜİK, 10:00',
      kaynak: "kural: TÜİK ayın 3'ü 10:00 (hafta sonuysa pazartesi) — resmî takvimle kayabilir", tahmini: true });
  }
  return out;
}

/** BIST bilanço yasal son günleri (SPK II-14.1). */
function bilancoOlaylari(bas, bit) {
  const out = [];
  const y0 = new Date(bas).getUTCFullYear();
  for (const yil of [y0 - 1, y0, y0 + 1]) {
    for (const [donemSonu, etiket, solo, kons] of [[`${yil}-03-31`, '1Ç', 30, 40], [`${yil}-06-30`, '2Ç (6 aylık)', 50, 60], [`${yil}-09-30`, '3Ç', 30, 40], [`${yil}-12-31`, 'yıllık', 60, 70]]) {
      for (const [gunSay, tur] of [[solo, 'konsolide olmayan'], [kons, 'konsolide']]) {
        const t = Date.parse(donemSonu + 'T00:00:00Z') + gunSay * GUN;
        const d = new Date(t);
        const gun = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        const zaman = O.yereldenUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 23, 59, 'Europe/Istanbul');
        if (zaman < bas - 2 * GUN || zaman > bit) continue;
        const dn = etiket === 'yıllık' ? `${yil} yıllık` : `${yil} ${etiket}`;
        out.push({ kimlik: `bilanco-${yil}-${etiket}-${gunSay}`, tur: 'bilanco', gun, zaman, baslik: `BIST bilanço son günü — ${dn} (${tur})`,
          ayrinti: `dönem sonu + ${gunSay} gün; açıklanan bilançoların özeti Bilanço özeti bildiriminde`, kaynak: 'SPK II-14.1 md. 10 yasal süresi (tatil kaydırması uygulanmadı)', tahmini: true });
      }
    }
  }
  return out;
}

/** Elle girilen olaylar (kilit açılımı vb.) — geçersiz satır atlanır. */
function elleOlaylar(liste) {
  const out = [];
  for (const [i, x] of (Array.isArray(liste) ? liste : []).entries()) {
    if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x.gun) || !x.baslik) continue;
    const [y, a, g] = x.gun.split('-').map(Number);
    const [s, dk] = (/^\d{2}:\d{2}$/.test(x.saat || '') ? x.saat : '12:00').split(':').map(Number);
    const tur = x.tur === 'kilit' ? 'kilit' : 'diger';
    out.push({ kimlik: `elle-${x.gun}-${i}`, tur, gun: x.gun, zaman: O.yereldenUtc(y, a, g, s, dk, 'Europe/Istanbul'), baslik: String(x.baslik).slice(0, 120),
      ayrinti: x.not ? String(x.not).slice(0, 200) : (x.saat ? `${x.saat} (TR)` : ''), kaynak: 'elle girildi (piyasa-olaylar.json)', tahmini: false, saatVar: !!x.saat });
  }
  return out;
}

/**
 * Saf: tüm kaynaklar → [bas, bit] aralığındaki olaylar (zamana göre).
 * @param g { fomc: [{gun, sep}], abdTufe: [{gun, saat}], elle: [] }
 */
function olaylar(g, bas, bit) {
  const l = [...fomcOlaylari(g.fomc), ...abdTufeOlaylari(g.abdTufe), ...trTufeOlaylari(bas, bit), ...bilancoOlaylari(bas, bit), ...elleOlaylar(g.elle)]
    .filter(x => x.zaman >= bas && x.zaman <= bit);
  const tek = new Map(l.map(x => [x.kimlik, x]));
  return [...tek.values()].sort((a, b) => a.zaman - b.zaman);
}

/** İstanbul haftası (pazartesi 00:00 → pazar 23:59) sınırları. */
function haftaSiniri(simdi) {
  const y = O.yerel(simdi, 'Europe/Istanbul');
  const fark = (y.hg + 6) % 7;     // pazartesiden beri gün
  const d = new Date(Date.UTC(y.y, y.a - 1, y.g - fark));
  const bas = O.yereldenUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, 'Europe/Istanbul');
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7));
  const bit = O.yereldenUtc(s.getUTCFullYear(), s.getUTCMonth() + 1, s.getUTCDate(), 0, 0, 'Europe/Istanbul') - 1;
  return { bas, bit };
}

/** Saf: olay satırı metni "Çar 28 Eki 21:00 · FOMC faiz kararı". */
function olayMetni(x) {
  const i = ist(x.zaman);
  const [y, a, g] = i.gun.split('-').map(Number);
  const saatli = x.tur !== 'bilanco' && ((x.tur !== 'kilit' && x.tur !== 'diger') || x.saatVar);
  return `${GUN_AD[i.haftaGunu].slice(0, 3)} ${g} ${AY_AD[a - 1].slice(0, 3)}${saatli ? ` ${i.saat}` : ''} · ${x.baslik}${x.tahmini ? ' (tahmini)' : ''}`;
}

module.exports = { ist, ayAdi, fomcOlaylari, abdTufeOlaylari, trTufeOlaylari, bilancoOlaylari, elleOlaylar, olaylar, haftaSiniri, olayMetni, AY_AD, GUN_AD };
