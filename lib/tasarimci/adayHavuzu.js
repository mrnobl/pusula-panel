/**
 * ADAY HAVUZU — Portföy › Model portföyler'de "sıradaki karar bugün verilse" önizlemesi (62.3, yalnız bilgi).
 * ═══════════════════════════════════════════════════════════════════════════
 * Nasdaq M10 ve BIST M10'un seçim kuralını (stratejiler/m10.js · bistM10.js `secim`, kural DEĞİŞMEDİ) SIRADAKİ ay sonu kararının
 * ayıyla bugünkü veriye uygular ve tüm sıralamayı verir: her hisse için puan, sıra ve modelin şu an elinde olup olmadığı.
 *   · Nasdaq M10: puan = 12-1 getirisi (t−12 ay sonu → t−1 ay sonu kapanışı) — ikisi de geçmiş ay sonu, yani sıralama karar
 *     gününden önce de KESİNE yakındır; değişebilecek tek şey endeks üyeliği ve verisi bayatlayan hisse.
 *   · BIST M10: evren (son 63 günün medyan cirosuyla en likit 30) karar günü yeniden hesaplanır → önizleme TAHMİNDİR.
 * Durumlar: 'kaliyor' (elde, ilk 10'da) · 'cikacak' (elde, ilk 10 dışında) · 'girecek' (elde değil, ilk 10'da) · 'yedek' (11–15).
 * Tasarımcı zamanlayıcısı her tikte hesaplar ve data/tasarimci/aday-havuzu.json'a yazar (GET /api/tasarimci/aday-havuzu yalnız okur).
 *
 * API: hesapla({ P, kararlar, bugun, simdi }) → { guncelleme, bugun, modeller: { 'm-qqq-m10': {...}, 'm-bist-m10': {...} } }
 *      durumlar(tum, elde, k = 10, yedek = 5) → [{ sira, s, p, elde, durum }]  (saf; öz test)
 */
'use strict';
const T = require('./takvim');

const K = 10, YEDEK = 5;
const R = x => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);
const ayNo = t => { const x = new Date(t); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };
const tarih = t => new Date(t).toISOString().slice(0, 10);

/** Saf: tam sıralama + eldekiler → gösterilecek satırlar (ilk k + yedek, ayrıca sıralamanın dışında kalan eldekiler). */
function durumlar(tum, elde, k = K, yedek = YEDEK) {
  const E = new Set(elde || []);
  const out = [];
  (tum || []).forEach((x, i) => {
    const sira = i + 1, e = E.has(x.s);
    let durum = null;
    if (sira <= k) durum = e ? 'kaliyor' : 'girecek';
    else if (e) durum = 'cikacak';
    else if (sira <= k + yedek) durum = 'yedek';
    if (durum) out.push({ sira, s: x.s, p: R(x.p), elde: e, durum });
  });
  const sirada = new Set((tum || []).map(x => x.s));
  for (const s of elde || []) if (!sirada.has(s)) out.push({ sira: null, s, p: null, elde: true, durum: 'cikacak', neden: 'sıralamaya girmiyor (evren/üyelik dışı ya da verisi eksik)' });
  return out;
}

function sonListe(kararlar, id) {
  const l = (kararlar || []).filter(k => k.model === id && k.liste && k.tur2 !== 'dengeleme').sort((a, b) => (a.kararGunu < b.kararGunu ? -1 : 1));
  const s = l[l.length - 1];
  return s ? { kararGunu: s.kararGunu, uygulamaGunu: s.uygulamaGunu, liste: s.liste.map(x => x.s) } : null;
}

function hesapla({ P, kararlar, bugun, simdi = Date.now() }) {
  const out = { guncelleme: new Date(simdi).toISOString(), bugun, modeller: {} };
  const sonraki = borsa => T.sonrakiKararlar(1, borsa, { simdi: T.ms(bugun) })[0];
  // Nasdaq M10
  try {
    const M10 = require('./stratejiler/m10');
    const N = P.nyse(), D = N.D, d = D.tk.length - 1, sk = sonraki('NYSE');
    const s = M10.secim(D, d, false, { ay: ayNo(T.ms(sk.karar)) });
    const son = sonListe(kararlar, 'm-qqq-m10');
    out.modeller['m-qqq-m10'] = {
      sonrakiKarar: sk, veriGunu: tarih(D.tk[d]), aday: s.aday, uyeSay: s.uyeSay, uyeAy: s.uyeAy, sonKarar: son,
      kesinlik: 'kesine-yakin', satirlar: durumlar(s.tum, son ? son.liste : []), eksikVeri: (s.eksikVeri || []).slice(0, 20)
    };
  } catch (e) { out.modeller['m-qqq-m10'] = { hata: e.message }; }
  // BIST M10
  try {
    const BM = require('./stratejiler/bistM10');
    const B = P.bist(), X = B.X, d = X.D - 1, sk = sonraki('BIST');
    const s = BM.secim(X, d, undefined, { ay: ayNo(T.ms(sk.karar)) });
    const son = sonListe(kararlar, 'm-bist-m10');
    out.modeller['m-bist-m10'] = {
      sonrakiKarar: sk, veriGunu: tarih(X.takvim[d]), aday: s.aday, evren: s.evren, sonKarar: son,
      kesinlik: 'tahmin', satirlar: durumlar(s.tum, son ? son.liste : [])
    };
  } catch (e) { out.modeller['m-bist-m10'] = { hata: e.message }; }
  return out;
}

module.exports = { hesapla, durumlar, K, YEDEK };
