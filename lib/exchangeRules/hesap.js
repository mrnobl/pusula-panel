/**
 * BINANCE USDⓈ-M PARA HESAPLARI — marj, likidasyon, ücret, funding, PnL
 * ═══════════════════════════════════════════════════════════════════════════
 * Saf fonksiyonlar; G/Ç yok. Kaynaklar (araştırma raporu §2–§5):
 *   likidasyon  https://www.binance.com/en/support/faq/b3c689c1f50a44cabb3a84e663b81d93
 *   marj        https://www.binance.com/en/support/faq/360033162192 ve 4f83b65d83654b5e933f85ef12bf769d
 *   ücret       https://www.binance.com/en/support/faq/360033544231
 *   funding     https://www.binance.com/en/support/faq/360033525031
 *
 * KURAL: gerçekleşmemiş K/Z, bakım marjı, funding ve likidasyon MARK fiyatıyla;
 * gerçekleşmiş K/Z ve ücret DOLUM fiyatıyla.
 */
const { YEDEK_KADEMELER, kademeNormalize } = require('./ayristir');

const yonIsareti = (yon) => {
  const y = String(yon || '').toLowerCase();
  if (y === 'long' || y === 'buy') return 1;
  if (y === 'short' || y === 'sell') return -1;
  throw new Error(`yön long ya da short olmalı: ${yon}`);
};

/** Kademe listesini (her biçimde) normalize eder; boşsa YEDEK tablo. */
function kademeler_(liste) {
  if (Array.isArray(liste) && liste.length && liste[0] && liste[0].mmr !== undefined && liste[0].cum !== undefined) return liste;
  const n = kademeNormalize(liste);
  return n.length ? n : YEDEK_KADEMELER;
}

/** Nominale düşen kademe: minNominal < nominal ≤ maxNominal (0 ilk kademe). */
function kademeBul(kademeler, nominal) {
  const liste = kademeler_(kademeler);
  const n = Math.abs(Number(nominal) || 0);
  for (const t of liste) if (n <= t.maxNominal) return t;
  return liste[liste.length - 1];
}

/** Bakım marjı = nominal × MMR − cum (nominal mark fiyatıyla). */
function bakimMarji(kademeler, nominal) {
  const t = kademeBul(kademeler, nominal);
  return { tutar: Math.max(0, Math.abs(nominal) * t.mmr - t.cum), kademe: t };
}

/** Başlangıç marjı = nominal / kaldıraç. */
function baslangicMarji(nominal, kaldirac) {
  if (!(kaldirac > 0)) throw new Error('kaldıraç pozitif olmalı');
  return Math.abs(nominal) / kaldirac;
}

/**
 * Emir verilirken istenen marj (SSS 4f83b65d…).
 *   One-way: Max(|P + B|, |P − A|) / kaldıraç
 *     P = imzalı pozisyon nominali (MARK ile; long +, short −)
 *     B = açık alış emirlerinin değeri (LİMİT fiyatıyla), A = açık satış emirlerinin değeri
 *   Hedge: iki tarafın toplamı; her taraf (|poz nominali| + aynı taraftaki açılış
 *     emirleri) / kaldıraç. ⚠ Hedge biçimi belgede tek cümle — DOĞRULANMADI.
 * Piyasa emrindeki "open loss" payı MODELLENMEDİ (belge açık değil).
 */
function emirMarjGereksinimi({ pozisyonNominali = 0, alisEmirDegeri = 0, satisEmirDegeri = 0, kaldirac, hedge = false, long, short } = {}) {
  if (!(kaldirac > 0)) throw new Error('kaldıraç pozitif olmalı');
  if (hedge) {
    const taraf = (x) => x ? (Math.abs(x.pozisyonNominali || 0) + (x.emirDegeri || 0)) / kaldirac : 0;
    return taraf(long) + taraf(short);
  }
  return Math.max(Math.abs(pozisyonNominali + alisEmirDegeri), Math.abs(pozisyonNominali - satisEmirDegeri)) / kaldirac;
}

/** Marj oranı = bakım marjı / marj bakiyesi. ≥ 1 (yüzde 100) → likidasyon. */
function marjOrani(bakim, marjBakiyesi) {
  if (!(marjBakiyesi > 0)) return Infinity;
  return bakim / marjBakiyesi;
}

/**
 * RESMİ LİKİDASYON FORMÜLÜ (genel hâl: çapraz/izole, one-way/hedge).
 *
 *   LP = ( WB − TMM1 + UPNL1 + cumB + cumL + cumS
 *          − SideB × QB × EPB − QL × EPL + QS × EPS )
 *      / ( QB × MMR_B + QL × MMR_L + QS × MMR_S − SideB × QB − QL + QS )
 *
 * İzolede WB = pozisyonun izole cüzdanı, TMM1 = UPNL1 = 0. Çaprazda WB = çapraz
 * cüzdan bakiyesi, TMM1/UPNL1 = DİĞER kontratların bakım marjı ve K/Z'si.
 * One-way'de long/short boş; hedge'de both boş.
 *
 * @param both  { yon:'long'|'short', miktar, girisFiyati, mmr, cum }
 * @param long  { miktar, girisFiyati, mmr, cum }
 * @param short { miktar, girisFiyati, mmr, cum }
 * @returns fiyat; likidasyon yoksa (fiyat ≤ 0 ya da payda ≤ 0) 0 — Binance da "0" gösterir.
 */
function likidasyonFiyati({ cuzdanBakiyesi, digerBakimMarji = 0, digerPnl = 0, both = null, long = null, short = null } = {}) {
  const b = both && both.miktar ? both : null;
  const l = long && long.miktar ? long : null;
  const s = short && short.miktar ? short : null;
  const side = b ? yonIsareti(b.yon) : 0;
  const pay = cuzdanBakiyesi - digerBakimMarji + digerPnl
    + (b ? b.cum || 0 : 0) + (l ? l.cum || 0 : 0) + (s ? s.cum || 0 : 0)
    - (b ? side * Math.abs(b.miktar) * b.girisFiyati : 0)
    - (l ? Math.abs(l.miktar) * l.girisFiyati : 0)
    + (s ? Math.abs(s.miktar) * s.girisFiyati : 0);
  const payda = (b ? Math.abs(b.miktar) * b.mmr : 0) + (l ? Math.abs(l.miktar) * l.mmr : 0) + (s ? Math.abs(s.miktar) * s.mmr : 0)
    - (b ? side * Math.abs(b.miktar) : 0) - (l ? Math.abs(l.miktar) : 0) + (s ? Math.abs(s.miktar) : 0);
  if (payda === 0) return 0;
  const lp = pay / payda;
  return Number.isFinite(lp) && lp > 0 ? lp : 0;
}

/**
 * İZOLE + ONE-WAY likidasyon, kademe tablosuyla.
 *   long : LP = (Q·EP − WB − cum) / (Q·(1 − MMR))
 *   short: LP = (Q·EP + WB + cum) / (Q·(1 + MMR))
 *
 * Kademe seçimi:
 *   'guncel'     (varsayılan) |Q| × markFiyati (yoksa giriş) nominalinin kademesi —
 *                belgedeki örnek bu şekilde.
 *   'likidasyon' likidasyon fiyatındaki nominalin kademesi (kendi içinde tutarlı çözüm).
 * İkisi kademe sınırı aşılmadıkça AYNI sonucu verir (cum sürekliliği). Binance'in
 * hangisini kullandığı DOĞRULANMADI.
 *
 * @returns { fiyat, kademe, mmr, cum, kademeSecimi }
 */
function izoleLikidasyon({ yon, miktar, girisFiyati, izoleCuzdan, kademeler, markFiyati, kademeSecimi = 'guncel' } = {}) {
  const liste = kademeler_(kademeler);
  const q = Math.abs(miktar);
  const isaret = yonIsareti(yon);
  const coz = (t) => likidasyonFiyati({
    cuzdanBakiyesi: izoleCuzdan,
    both: { yon: isaret > 0 ? 'long' : 'short', miktar: q, girisFiyati, mmr: t.mmr, cum: t.cum }
  });
  if (kademeSecimi === 'likidasyon') {
    for (const t of liste) {
      const lp = coz(t);
      const n = q * lp;
      if (n > t.minNominal && n <= t.maxNominal) return { fiyat: lp, kademe: t.kademe, mmr: t.mmr, cum: t.cum, kademeSecimi };
    }
    // Tutarlı kademe yoksa (lp = 0 vb.) güncel kademeye düş.
  }
  const ref = Number.isFinite(markFiyati) && markFiyati > 0 ? markFiyati : girisFiyati;
  const t = kademeBul(liste, q * ref);
  return { fiyat: coz(t), kademe: t.kademe, mmr: t.mmr, cum: t.cum, kademeSecimi: 'guncel' };
}

/** BNB ile ödemede indirim (VIP0: %10). BNB USDⓈ-M cüzdanında yoksa indirim YOK. */
function ucretOranlari({ maker, taker }, { bnbIndirimi = false, indirimOrani = 0.1 } = {}) {
  const c = bnbIndirimi ? 1 - indirimOrani : 1;
  return { maker: maker * c, taker: taker * c };
}

/** Dolum başına ücret = miktar × dolum fiyatı × oran. `maker` verilirse oran oradan seçilir. */
function islemUcreti({ miktar, fiyat, oran, maker, oranlar }) {
  const r = Number.isFinite(oran) ? oran : (maker ? oranlar.maker : oranlar.taker);
  return Math.abs(miktar) * fiyat * r;
}

/** Funding oranını tavan/tabana kıstırır (fundingInfo adjustedFundingRateCap/Floor). */
function fundingOranKistir(oran, tavan, taban) {
  let r = oran;
  if (Number.isFinite(tavan) && r > tavan) r = tavan;
  if (Number.isFinite(taban) && r < taban) r = taban;
  return r;
}

/**
 * Funding ödemesi = MARK × miktar × oran. POZİTİF sonuç pozisyonun ÖDEDİĞİ,
 * negatif ALDIĞI tutardır (oran > 0: long öder, short alır).
 */
function fundingOdemesi({ yon, miktar, markFiyati, oran, tavan, taban }) {
  const r = fundingOranKistir(oran, tavan, taban);
  return yonIsareti(yon) * Math.abs(miktar) * markFiyati * r;
}

/** `ms` anını içeren funding döneminin başlangıç damgası (UTC'ye hizalı). */
function fundingDamgasi(aralikSaat, ms) {
  const a = aralikSaat * 3600000;
  return Math.floor(ms / a) * a;
}

/** `ms`den SONRAKİ ilk funding zamanı (ms tam damgaysa bir sonraki). */
function sonrakiFundingZamani(aralikSaat, ms) {
  return fundingDamgasi(aralikSaat, ms) + aralikSaat * 3600000;
}

/** Sembolün funding aralığı: { saat, kaynak: 'fundingInfo' | 'varsayim' }. */
function fundingAraligi(kural) {
  const f = kural && kural.funding;
  if (f && f.aralikSaat) return { saat: f.aralikSaat, kaynak: f.aralikKaynak || 'fundingInfo' };
  return { saat: 8, kaynak: 'varsayim' };
}

/** Gerçekleşmemiş K/Z = yön × (MARK − giriş) × miktar. */
function gerceklesmemisPnl({ yon, miktar, girisFiyati, markFiyati }) {
  return yonIsareti(yon) * (markFiyati - girisFiyati) * Math.abs(miktar);
}

/** Gerçekleşmiş K/Z (komisyon HARİÇ) = yön × (dolum − giriş) × miktar. */
function gerceklesmisPnl({ yon, miktar, girisFiyati, dolumFiyati }) {
  return yonIsareti(yon) * (dolumFiyati - girisFiyati) * Math.abs(miktar);
}

module.exports = {
  kademeBul, bakimMarji, baslangicMarji, emirMarjGereksinimi, marjOrani,
  likidasyonFiyati, izoleLikidasyon,
  ucretOranlari, islemUcreti,
  fundingOranKistir, fundingOdemesi, fundingDamgasi, sonrakiFundingZamani, fundingAraligi,
  gerceklesmemisPnl, gerceklesmisPnl
};
