/**
 * HÜCUM / DENGE İLERİ VERİ EŞİKLERİ — TEK KAYNAK.
 * Değerler PLAN-ILERI-HUCUM-DENGE.md (ÖN-KAYIT, commit 21aad91) tablosundan AYNEN alındı;
 * plan dosyası değişmez, bu dosya da değişmez ("Bu dosyadan sonra eşikler değiştirilmez").
 * `scripts/isletim-selftest.js` buradaki sayıların plan dosyasındaki metinle aynı olduğunu denetler.
 * EK (2026-10-11, karar Ö9 / G3b): `hucumS` girdisi — PLAN-ILERI-HUCUM-S.md (deneme 861) "SONUÇ" tablosundan AYNEN;
 * Hücum / Denge girdileri birebir aynı kaldı.
 *
 * A. MODEL GEÇERLİLİĞİ — gölge (lib/ileri, emir yok) ileri MaxDD > p99 → "DUR" (yalnız gösterge +
 *    alarm; kural değişmez). Ufuk: o ana EN YAKIN kontrol noktası (90 / 182 / 365 gün).
 * B. UYGULAMA TAKİBİ — 30 günlük birikimli |gerçekleşen − gölge|: ≤ %3 Normal, %3–5 İncele
 *    (Telegram uyarı), > %5 ya da mutabakat uyuşmazlığı → ENGEL + alarm.
 */
const UFUKLAR = Object.freeze([90, 182, 365]);

/** Bootstrap dağılımı (b=20, N=5000, tohum 7) — getiri p5/p50/p95, MaxDD p50/p95/p99. */
const DAGILIM = Object.freeze({
  hucum: Object.freeze({
    90: { getiri: { p5: -0.180, p50: 0.085, p95: 0.884 }, maxdd: { p50: 0.156, p95: 0.281, p99: 0.342 } },
    182: { getiri: { p5: -0.214, p50: 0.250, p95: 1.646 }, maxdd: { p50: 0.213, p95: 0.352, p99: 0.422 } },
    365: { getiri: { p5: -0.175, p50: 0.666, p95: 3.486 }, maxdd: { p50: 0.262, p95: 0.428, p99: 0.507 } },
  }),
  denge: Object.freeze({
    90: { getiri: { p5: -0.104, p50: 0.077, p95: 0.537 }, maxdd: { p50: 0.103, p95: 0.180, p99: 0.219 } },
    182: { getiri: { p5: -0.112, p50: 0.202, p95: 0.934 }, maxdd: { p50: 0.135, p95: 0.227, p99: 0.276 } },
    365: { getiri: { p5: -0.057, p50: 0.503, p95: 1.889 }, maxdd: { p50: 0.165, p95: 0.274, p99: 0.340 } },
  }),
  // Hücum-S 1000 $ (deneme 861, PLAN-ILERI-HUCUM-S.md "SONUÇ" — ön kayıt ölçümden önce, karar Ö9 / G3b): AYNI yöntem
  // (b=20, N=5000, tohum 7), seri = sermaye-1000.js Hücum-S 1000 $ ÇEKİLEBİLİR USDT KISITLI (k20), 2020-09-04 → 2026-10-05.
  // Ayrı Hücum-S gölgesi yazılana kadar Hücum C0 gölgesine uygulanır (tutucu). Yukarıdaki Hücum/Denge değerleri DEĞİŞMEDİ.
  hucumS: Object.freeze({
    90: { getiri: { p5: -0.176, p50: 0.078, p95: 0.803 }, maxdd: { p50: 0.156, p95: 0.275, p99: 0.340 } },
    182: { getiri: { p5: -0.212, p50: 0.234, p95: 1.477 }, maxdd: { p50: 0.209, p95: 0.349, p99: 0.417 } },
    365: { getiri: { p5: -0.180, p50: 0.603, p95: 3.096 }, maxdd: { p50: 0.258, p95: 0.422, p99: 0.503 } },
  }),
});
/** Her dağılımın ön-kayıt dosyası. */
const PLANLAR = Object.freeze({ hucum: 'PLAN-ILERI-HUCUM-DENGE.md', denge: 'PLAN-ILERI-HUCUM-DENGE.md', hucumS: 'PLAN-ILERI-HUCUM-S.md' });

const UYGULAMA = Object.freeze({ pencereGun: 30, incele: 0.03, engel: 0.05 });

/** Geçen gün sayısına en yakın ufuk (eşitlikte küçük ufuk). */
function enYakinUfuk(gun) {
  let en = UFUKLAR[0];
  for (const u of UFUKLAR) if (Math.abs(u - gun) < Math.abs(en - gun)) en = u;
  return en;
}

/**
 * A durumu: gölge ileri MaxDD'yi o ana en yakın ufkun p95 / p99 eşiğiyle karşılaştırır.
 * @returns {{ ufuk, p95, p99, maxdd, durum: 'normal'|'uyari'|'DUR', metin }}
 */
function modelDurumu(ad, gun, maxdd) {
  const d = DAGILIM[ad];
  if (!d) throw new Error(`bilinmeyen strateji: ${ad}`);
  const ufuk = enYakinUfuk(gun);
  const { p95, p99 } = d[ufuk].maxdd;
  const durum = maxdd > p99 ? 'DUR' : maxdd > p95 ? 'uyari' : 'normal';
  const metin = durum === 'DUR' ? `DUR — gölge MaxDD %${(maxdd * 100).toFixed(1)} > p99 %${(p99 * 100).toFixed(1)} (${ufuk} g): model geçersiz sayılır, gerçek para kullanılmaz`
    : durum === 'uyari' ? `Uyarı — gölge MaxDD %${(maxdd * 100).toFixed(1)} > p95 %${(p95 * 100).toFixed(1)} (${ufuk} g): neden analizi, kural DEĞİŞMEZ`
      : `Normal — gölge MaxDD %${(maxdd * 100).toFixed(1)} ≤ p95 %${(p95 * 100).toFixed(1)} (${ufuk} g)`;
  return { ufuk, p95, p99, maxdd, durum, metin };
}

/** B bandı: 30 g birikimli |fark| → 'normal' | 'incele' | 'engel'. */
function uygulamaBandi(birikimMutlak) {
  if (!(birikimMutlak >= 0)) return 'normal';
  if (birikimMutlak > UYGULAMA.engel) return 'engel';
  if (birikimMutlak > UYGULAMA.incele) return 'incele';
  return 'normal';
}

module.exports = { UFUKLAR, DAGILIM, UYGULAMA, enYakinUfuk, modelDurumu, uygulamaBandi, PLAN: 'PLAN-ILERI-HUCUM-DENGE.md', PLANLAR };
