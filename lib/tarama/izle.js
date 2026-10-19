/**
 * DİKKAT F2 — İZLE dilimi (`kural-v1` §3, deneme 781) + eşit ağırlıklı puan gölgesi (`puan-v1` §4, deneme 782).
 * PLAN-DIKKAT-V1-ONKAYIT.md §3, §4, §5 H-DL2/H-DL2P, §6, EK-1 A6/A7/A9, düzeltme 2, EK-2.
 * ═══════════════════════════════════════════════════════════════════════════
 * SAF fonksiyonlar: günün dikkat satırları (kapılar + küçük ölçüm `m`) + 30 gün önceki kayıt günlerinin ölçümleri → İZLE listesi
 * (ilk 15) ve puan listesi (ilk 15, GÖLGE). Ağ yok, dosya yok (dosya işleri lib/tarama/izleTakip.js).
 *
 *   İZLE ADAYI (gün t) ⇔  (1) KAÇIN temiz: K1–K16'nın hiçbiri doğru değil VE ağına uygun güvenlik kaynağı (GoPlus / RugCheck) bugün
 *                             cevap verdi (CEX-only yerel zincir token'ında yalnız "hiçbir kapı doğru değil")
 *                         (2) beş aileden ≥ 3'ünde veri: temel (DefiLlama ücret) · benimseme (holder 30 g) · likidite/hacim ·
 *                             geliştirici (GitHub) · dağılım (ayıklanmış ilk 10). Eksik aile sıfır sayılmaz.
 *                         (3) P/F = piyasa değeri / (son 30 g ücret × 365/30) kategorisi içinde yüzdelik ≤ %20 (kategoride P/F'li
 *                             < 5 token → tüm kümede) VE holder sayısının 30 g log değişimi > 0. Ücret ≤ 0 → P/F yok.
 *   İZLE LİSTESİ = adaylar P/F yüzdeliğine göre artan (eşitlikte sembol), ilk N = 15; az aday → kısa liste, doldurulmaz.
 *   PUAN (gölge) = şart 1 + 2'yi sağlayanlarda 8 özelliğin yön düzeltilmiş yüzdeliklerinin ortalaması (≥ 3 özellik); ilk 15.
 *                  Hiçbir karar puandan türetilmez.
 *
 * Sabitler DONDURULMUŞ (`IZLE_V1`, `PUAN_V1`, kendi SHA'larıyla — `izleSha`, `puanSha`). KAÇIN'ın `KURAL_V1`'i ve `kurallarSha`'sı
 * bu modülden ETKİLENMEZ (lib/tarama/dikkat.js değişmedi). Değişiklik = yeni sürüm + yeni deneme numarası (§9).
 * Liste bota, portföye, emre bağlanmaz (K1–K6). lib/live, lib/risk'e dokunmaz.
 *
 * ÖLÇÜM NETLEŞTİRMELERİ (2026-10-15, t0 öncesi; hiçbir İZLE listesi, sepet ya da ileri getiri hesaplanmadan yazıldı — kural değişikliği
 * değil, ön kaydın açık bıraktığı uygulama ayrıntıları; sonradan değiştirilirse ayrı bir kayıtla). İ10–İ20 lib/tarama/izleTakip.js'te.
 *   İ1 Şartlar yalnız değerlendirme kümesindeki (dikkat `kume()`: t0 sonrası evren, öncesi EK-2 b ısınma kümesi; `evrende`) token'lara
 *      uygulanır. Yüzdelikler de bu kümeyle hesaplanır.
 *   İ2 Şart 1: on altı kapının (bilgi kapıları K2/K6/K10 dahil — ön kayıt "K1–K16'nın hiçbiri") hiçbiri 'dogru' değil. "Güvenlik
 *      kaynağı cevap verdi" = GoPlus/RugCheck durumu ok/önbellek; `bos` (kaynakta kayıt yok) cevap sayılmaz (temizlik doğrulanamaz);
 *      sözleşme eşlemesi kurulamayan token (N3) şartı sağlamaz; sözleşmesi bilinmeyen / yerel zincir token'ında yalnız kapı şartı.
 *   İ3 Aile verisi: temel = son 30 g ücret > 0 (ücret ≤ 0 A7 gereği "yetersiz veri"); benimseme = holder 30 g log değişimi
 *      hesaplanabildi; likidite/hacim = DexScreener toplam likiditesi > 0 ya da günün 24 s hacmi > 0; geliştirici = GitHub en yeni
 *      push tarihi var; dağılım = ayıklanmış ilk 10 payı var.
 *   İ4 Piyasa değeri = CoinGecko `piyasaDegeri` (dolaşım, > 0), yoksa DefiLlama `mcap` (> 0); kullanılan kaynak kayda yazılır.
 *   İ5 30 g değişim (holder, ücret, TVL; bilgi: fiyat): t−30 takvim günü kayıt günüyse o günün değeri; değilse — ya da token / değer
 *      o gün yoksa — t−31, t−32, t−33 içindeki en yakın (en geç) kayıt günü; hiçbiri yoksa özellik eksik. Holder iki günde AYNI
 *      kaynaktan olmalı (değilse daha eski gün denenir). log değişim yalnız iki değer de > 0 ise. Eski günde dikkat.jsonl yoksa
 *      ölçüm anlik.jsonl'dan kurulur.
 *   İ6 Yüzdelik = (ortalama sıra − 1) / (n − 1) ∈ [0, 1], eşitlikte ortalama sıra; n = 1 → 0,5 (tek token "alt %20" sayılmaz).
 *      P/F kategorisi = DefiLlama kategori adı; kategorisi olmayan token kategoride < 5 token gibi tüm kümede sıralanır.
 *      Eşik karşılaştırması 1e−12 toleranslı (≤ 0,20).
 *   İ7 Eşitlik sırası: sembol (kod noktası sırası), sonra anahtar (deterministik).
 *   İ8 Puan özellikleri: P/S = piyasa değeri / (son 30 g gelir × 365/30), gelir ≤ 0 → eksik; DEX likidite / piyasa değeri yalnız
 *      DexScreener cevap verdiyse (likidite 0 dahil; çift yok → eksik); son commit yaşı = gün − en yeni push günü. Yön: ön kayıt §4.
 *   İ9 Momentum (geçmiş 30 g log fiyat değişimi, İ5 araması, aynı fiyat kaynağı) yalnız bilgi alanıdır; kurala ve sıraya girmez.
 */
'use strict';
const D = require('./dikkat');
const { kanonik, sha256 } = require('./ortak');

const pozitif = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const sonlu = (x) => typeof x === 'number' && Number.isFinite(x);
const TOL = 1e-12;

/** kural-v1 §3 (İZLE) + H-DL2 değerlendirme sabitleri (A6, A7, A9, düzeltme 2) — değiştirme: yeni sürüm. */
const IZLE_V1 = Object.freeze({
  surum: 'kural-v1', bolum: 'izle', deneme: 781,
  N: 15, yuzdelikEsik: 0.20, kategoriAsgari: 5, aileAsgari: 3, holderEsik: 0, yillik: 365 / 30,
  aileler: Object.freeze(['temel', 'benimseme', 'likidite', 'gelistirici', 'dagilim']),
  degisimGun: 30, geriGun: 3,
  deger: Object.freeze({
    tutGun: 30, pencereSayi: 12, kayipGun: 14, hukumGun: 374, asgariPencere: 5, asgariBoy: 5, rastgele: 1000, alfa: 0.05, holmTest: 2,
    maliyet: Object.freeze({ dex: 0.013, cex: 0.001 }), dexLikiditeAlt: 1000, onIzlemeKontrol: 3, a4Esik: 0.30,
  }),
});
/** puan-v1 §4 (GÖLGE) — özellikler ve yön önceden; ağırlık aranmaz, hiçbir zaman ayarlanmaz. */
const PUAN_V1 = Object.freeze({
  surum: 'puan-v1', deneme: 782, N: 15, asgariOzellik: 3,
  ozellikler: Object.freeze([
    Object.freeze(['pf', 'dusuk']), Object.freeze(['ps', 'dusuk']), Object.freeze(['ucretBuyume', 'yuksek']), Object.freeze(['tvlDegisim', 'yuksek']),
    Object.freeze(['holder30', 'yuksek']), Object.freeze(['ilk10', 'dusuk']), Object.freeze(['likiditeMcap', 'yuksek']), Object.freeze(['commitYas', 'dusuk']),
  ]),
});
const izleSha = () => sha256(kanonik(IZLE_V1));
const puanSha = () => sha256(kanonik(PUAN_V1));

const AILE_AD = Object.freeze({ temel: 'temel (DefiLlama ücret)', benimseme: 'benimseme (holder 30 g)', likidite: 'likidite / hacim', gelistirici: 'geliştirici (GitHub)', dagilim: 'dağılım (ayıklanmış ilk 10)' });
const OZELLIK_AD = Object.freeze({ pf: 'P/F (piyasa değeri / yıllık ücret)', ps: 'P/S (piyasa değeri / yıllık gelir)', ucretBuyume: 'ücret 30 g log büyümesi', tvlDegisim: 'TVL 30 g log değişimi',
  holder30: 'holder 30 g log değişimi', ilk10: 'ayıklanmış ilk 10 payı', likiditeMcap: 'DEX likidite / piyasa değeri', commitYas: 'son commit yaşı (gün)' });

// ── Ek küçük ölçüm (dikkat.jsonl `m`'ye eklenir; KAÇIN kapıları bu alanları OKUMAZ) ──
/**
 * Arşiv satırı → İZLE/puan için ek alanlar. dikkat.olcum()'un alanlarına DOKUNMAZ; çağıran `{ ...olcum, ...ozellik }` yazar.
 * Durum alanları (…D): 'ok' | 'bilinmiyor' (çağrıldı, cevap yok — A4 paydası) | 'uygulanmaz' (yapısal yokluk).
 */
function ozellik(row) {
  const ll = D.kaynak(row, 'defillama'), cg = D.kaynak(row, 'coingecko'), gh = D.kaynak(row, 'github'), gt = D.kaynak(row, 'geckoterminal');
  const llOk = ll.d === 'ok';
  const cgMc = cg.d === 'ok' && pozitif(cg.h.piyasaDegeri) ? cg.h.piyasaDegeri : null;
  const llMc = llOk && pozitif(ll.h.mcap) ? ll.h.mcap : null;
  const mcap = cgMc != null ? cgMc : llMc;
  const durumCevir = (d) => (d === 'ok' ? 'ok' : d === 'bilinmiyor' ? 'bilinmiyor' : 'uygulanmaz');
  const ucDurum = (alan, durumAlan) => {
    if (!llOk) return { v: null, d: durumCevir(ll.d) };
    const ds = ll.h[durumAlan];
    if (ds === 'hata') return { v: null, d: 'bilinmiyor' };
    if (ds && ds !== 'ok') return { v: null, d: 'uygulanmaz' };
    const x = ll.h[alan];
    return x && sonlu(x.t30) ? { v: x.t30, d: 'ok' } : { v: null, d: 'uygulanmaz' };
  };
  const uc = ucDurum('ucret', 'ucretDurum'), ge = ucDurum('gelir', 'gelirDurum');
  // holder kaynağı durumu (K13 ile aynı mantık: güvenlik kaynağı ∨ GeckoTerminal)
  const sinif = D.agSinifi(row);
  const g = sinif === 'evm' ? 'goplus' : sinif === 'sol' ? 'rugcheck' : null;
  const gv = g ? D.kaynak(row, g) : null;
  const holderVar = (gv && gv.d === 'ok' && pozitif(gv.h.holder)) || (gt.d === 'ok' && pozitif(gt.h.holder));
  const holderD = holderVar ? 'ok' : sinif === 'yok' ? 'uygulanmaz' : sinif === 'bilinmiyor' || (gv && gv.d === 'bilinmiyor') || gt.d === 'bilinmiyor' ? 'bilinmiyor' : 'uygulanmaz';
  const push = (gh.d === 'ok' && gh.h && gh.h.enYeniPush) ? String(gh.h.enYeniPush).slice(0, 10) : null;
  return {
    mcap, mcapKaynak: cgMc != null ? 'coingecko' : llMc != null ? 'defillama' : null,
    mcapD: mcap != null ? 'ok' : (cg.d === 'bilinmiyor' || ll.d === 'bilinmiyor') ? 'bilinmiyor' : 'uygulanmaz',
    llD: durumCevir(ll.d), kategori: llOk && ll.h.kategori ? String(ll.h.kategori) : null,
    ucret30: uc.v, ucretD: uc.d, gelir30: ge.v, gelirD: ge.d,
    tvl: llOk && sonlu(ll.h.tvl) ? ll.h.tvl : null,
    push, ghD: durumCevir(gh.d), holderD,
  };
}

// ── 30 gün önceki değer (İ5) ─────────────────────────────────────────────
/**
 * @param gecmis [{ gun, m: Map(anahtar → m) }] — [t−33, t−30] aralığındaki KAYIT günleri, YENİDEN ESKİYE
 * @param f (eskiM) → değer | null; ilk (en geç) değer veren gün kullanılır. @returns { gun, v } | null
 */
function eskiBul(gecmis, anahtar, f) {
  for (const g of gecmis || []) {
    const em = g.m && g.m.get ? g.m.get(anahtar) : null;
    if (!em) continue;
    const v = f(em);
    if (v != null) return { gun: g.gun, v };
  }
  return null;
}
const logDegisim = (a, b) => (pozitif(a) && pozitif(b) ? Math.log(b / a) : null);

/**
 * Token'ın gün t özellikleri. @param m bugünkü ölçüm (olcum + ozellik), @param gecmis İ5 günleri, @param gecmisVar t−33…t−30
 * arasında arşiv kaydı olabilir mi (arşivin ilk günü ≤ t−30): değilse eksik 30 g değerleri "uygulanmaz", kayıt boşluğuysa "bilinmiyor".
 */
function ozellikler(anahtar, m, gecmis, gun, gecmisVar = true) {
  const yil = IZLE_V1.yillik;
  const pf = pozitif(m.mcap) && pozitif(m.ucret30) ? m.mcap / (m.ucret30 * yil) : null;
  const ps = pozitif(m.mcap) && pozitif(m.gelir30) ? m.mcap / (m.gelir30 * yil) : null;
  const pfD = pf != null ? 'ok' : (m.ucretD === 'bilinmiyor' || m.llD === 'bilinmiyor' || (pozitif(m.ucret30) && m.mcapD === 'bilinmiyor')) ? 'bilinmiyor' : 'uygulanmaz';
  // holder 30 g (aynı kaynak)
  let holder30 = null, holder30D, holder30Gun = null;
  if (!pozitif(m.holder)) holder30D = m.holderD === 'bilinmiyor' ? 'bilinmiyor' : 'uygulanmaz';
  else {
    const e = eskiBul(gecmis, anahtar, em => (pozitif(em.holder) && em.holderKaynak === m.holderKaynak ? em.holder : null));
    if (e) { holder30 = Math.log(m.holder / e.v); holder30D = 'ok'; holder30Gun = e.gun; }
    else if (!gecmisVar) holder30D = 'uygulanmaz';
    else if (!(gecmis || []).length) holder30D = 'bilinmiyor';   // t−33…t−30 kayıt boşluğu (A4)
    else {
      const eskiD = eskiBul(gecmis, anahtar, em => em.holderD || null);
      holder30D = eskiD && eskiD.v === 'bilinmiyor' ? 'bilinmiyor' : 'uygulanmaz';
    }
  }
  const ucE = pozitif(m.ucret30) ? eskiBul(gecmis, anahtar, em => (pozitif(em.ucret30) ? em.ucret30 : null)) : null;
  const tvE = pozitif(m.tvl) ? eskiBul(gecmis, anahtar, em => (pozitif(em.tvl) ? em.tvl : null)) : null;
  const fyE = pozitif(m.fiyat) ? eskiBul(gecmis, anahtar, em => (pozitif(em.fiyat) && em.fiyatKaynak === m.fiyatKaynak ? em.fiyat : null)) : null;
  return {
    pf, pfD, ps, holder30, holder30D, holder30Gun,
    ucretBuyume: ucE ? logDegisim(ucE.v, m.ucret30) : null,
    tvlDegisim: tvE ? logDegisim(tvE.v, m.tvl) : null,
    ilk10: sonlu(m.ilk10Ayk) ? m.ilk10Ayk : null,
    likiditeMcap: m.likiditeD === 'ok' && sonlu(m.likidite) && pozitif(m.mcap) ? m.likidite / m.mcap : null,
    commitYas: m.push ? D.gunFark(m.push, gun) : null,
    momentum30: fyE ? logDegisim(fyE.v, m.fiyat) : null,
  };
}

/** Beş aileden verisi olanlar (İ3). */
function aileler(m, oz) {
  const l = [];
  if (pozitif(m.ucret30)) l.push('temel');
  if (oz.holder30 != null) l.push('benimseme');
  if ((m.likiditeD === 'ok' && pozitif(m.likidite)) || pozitif(m.hacim)) l.push('likidite');
  if (m.push) l.push('gelistirici');
  if (sonlu(m.ilk10Ayk)) l.push('dagilim');
  return l;
}

/** Şart 1 (İ2): dikkat satırı (kapılar + m.sinif/m.guvenlik). */
function kacinTemiz(s) {
  if (!s || !s.kapilar) return false;
  if (Object.values(s.kapilar).some(k => k && k.s === 'dogru')) return false;
  const sinif = s.m && s.m.sinif;
  if (sinif === 'yok') return true;
  if (sinif === 'evm' || sinif === 'sol') return s.m.guvenlik === 'ok';
  return false;
}

/** Ortalama sıralı yüzdelik (İ6): [{ k, v }] → Map(k → [0,1]); n = 1 → 0,5. */
function yuzdelik(l) {
  const s = l.filter(x => sonlu(x.v)).slice().sort((a, b) => a.v - b.v);
  const out = new Map();
  const n = s.length;
  if (n === 1) { out.set(s[0].k, 0.5); return out; }
  for (let i = 0; i < n;) {
    let j = i; while (j + 1 < n && s[j + 1].v === s[i].v) j++;
    const ort = (i + j) / 2;   // 0 tabanlı ortalama sıra
    for (let q = i; q <= j; q++) out.set(s[q].k, ort / (n - 1));
    i = j + 1;
  }
  return out;
}
const sirala = (a, b) => (String(a.sembol || '') < String(b.sembol || '') ? -1 : String(a.sembol || '') > String(b.sembol || '') ? 1 : String(a.anahtar) < String(b.anahtar) ? -1 : String(a.anahtar) > String(b.anahtar) ? 1 : 0);

// ── Günlük liste ─────────────────────────────────────────────────────────
/**
 * @param o { gun, satirlar: dikkat satırları (evrende, kapilar, m, kanat, sembol), gecmis: İ5 günleri, gecmisVar, dilim: Map(anahtar → { dilim }) }
 * @returns { liste, puanListe, havuz, aday, kume, sayim, payda, ozellik: Map } — dosya yazmaz
 */
function hesapla(o) {
  const { gun } = o;
  const kume = (o.satirlar || []).filter(s => s.evrende);
  const kayit = kume.map(s => {
    const oz = ozellikler(s.anahtar, s.m || {}, o.gecmis, gun, o.gecmisVar !== false);
    const al = aileler(s.m || {}, oz);
    const t1 = kacinTemiz(s);
    return { s, oz, al, sart1: t1, sart2: al.length >= IZLE_V1.aileAsgari, kategori: (s.m && s.m.kategori) || null };
  });
  // P/F yüzdeliği: kategorisi içinde, o gün P/F'si olan küme token'ları arasında; kategoride < 5 → tüm küme (İ6)
  const pfli = kayit.filter(x => x.oz.pf != null);
  const tum = yuzdelik(pfli.map(x => ({ k: x.s.anahtar, v: x.oz.pf })));
  const katSay = new Map();
  for (const x of pfli) if (x.kategori) katSay.set(x.kategori, (katSay.get(x.kategori) || 0) + 1);
  const katY = new Map();
  for (const [kat, n] of katSay) if (n >= IZLE_V1.kategoriAsgari) katY.set(kat, yuzdelik(pfli.filter(x => x.kategori === kat).map(x => ({ k: x.s.anahtar, v: x.oz.pf }))));
  for (const x of pfli) {
    const ky = x.kategori && katY.get(x.kategori);
    x.pfYuzdelik = ky ? ky.get(x.s.anahtar) : tum.get(x.s.anahtar);
    x.yuzdelikKapsam = ky ? 'kategori' : 'tum';
    x.kategoriN = x.kategori ? katSay.get(x.kategori) || 0 : 0;
  }
  const aday = kayit.filter(x => x.sart1 && x.sart2);
  const havuz = aday.filter(x => x.oz.pf != null);
  const sart3 = havuz.filter(x => x.pfYuzdelik <= IZLE_V1.yuzdelikEsik + TOL && x.oz.holder30 != null && x.oz.holder30 > IZLE_V1.holderEsik);
  const liste = sart3.map(x => ({ x, anahtar: x.s.anahtar, sembol: x.s.sembol })).sort((a, b) => (a.x.pfYuzdelik - b.x.pfYuzdelik) || sirala(a, b)).slice(0, IZLE_V1.N).map((y, i) => uyeSatiri(y.x, i + 1, o.dilim));
  // Puan (gölge): kapsam = şart 1 + 2
  const yz = {};
  for (const [ad, yon] of PUAN_V1.ozellikler) {
    const y = yuzdelik(aday.map(x => ({ k: x.s.anahtar, v: x.oz[ad] })));
    yz[ad] = yon === 'dusuk' ? new Map([...y].map(([k, v]) => [k, 1 - v])) : y;
  }
  const puanli = [];
  for (const x of aday) {
    const p = {};
    for (const [ad] of PUAN_V1.ozellikler) if (yz[ad].has(x.s.anahtar)) p[ad] = yz[ad].get(x.s.anahtar);
    const n = Object.keys(p).length;
    if (n >= PUAN_V1.asgariOzellik) { x.puan = Object.values(p).reduce((a, b) => a + b, 0) / n; x.puanYuzdelik = p; puanli.push(x); }
  }
  const puanListe = puanli.map(x => ({ x, anahtar: x.s.anahtar, sembol: x.s.sembol })).sort((a, b) => (b.x.puan - a.x.puan) || sirala(a, b)).slice(0, PUAN_V1.N).map((y, i) => ({ ...uyeSatiri(y.x, i + 1, o.dilim), puan: y.x.puan, ozellikSayisi: Object.keys(y.x.puanYuzdelik).length, yuzdelikler: y.x.puanYuzdelik }));
  // A4 (İ16): P/F ve holder 30 g değerlendirmeleri — bilinmiyor / (bilinmiyor + ok); uygulanmaz paydadan çıkar
  let top = 0, bil = 0;
  for (const x of kayit) for (const d of [x.oz.pfD, x.oz.holder30D]) { if (d === 'uygulanmaz') continue; top++; if (d === 'bilinmiyor') bil++; }
  return {
    liste, puanListe, havuz: havuz.map(x => x.s.anahtar).sort(), puanKapsam: puanli.length, aday: aday.length, kume: kume.length,
    sayim: { kume: kume.length, sart1: kayit.filter(x => x.sart1).length, sart2: kayit.filter(x => x.sart2).length, aday: aday.length, pf: pfli.length, havuz: havuz.length,
      holder30: kayit.filter(x => x.oz.holder30 != null).length, holder30Arti: havuz.filter(x => x.oz.holder30 != null && x.oz.holder30 > 0).length, dilim: havuz.filter(x => x.pfYuzdelik <= IZLE_V1.yuzdelikEsik + TOL).length, sart3: sart3.length },
    payda: { toplam: top, bilinmiyor: bil, oran: top ? bil / top : null },
    kayit,
  };
}

function uyeSatiri(x, sira, dilim) {
  const s = x.s, m = s.m || {};
  const u = dilim && dilim.get ? dilim.get(s.anahtar) : null;
  return { sira, anahtar: s.anahtar, sembol: s.sembol || null, kanat: s.kanat, ag: s.ag || null, kategori: x.kategori, kategoriN: x.kategoriN || 0, yuzdelikKapsam: x.yuzdelikKapsam || null,
    pf: x.oz.pf, pfYuzdelik: x.pfYuzdelik == null ? null : x.pfYuzdelik, holder30: x.oz.holder30, aileler: x.al, mcap: m.mcap == null ? null : m.mcap, mcapKaynak: m.mcapKaynak || null,
    momentum30: x.oz.momentum30, fiyat: m.fiyat == null ? null : m.fiyat, fiyatKaynak: m.fiyatKaynak || null, dilim: u && Number.isFinite(u.dilim) ? u.dilim : null };
}

module.exports = { IZLE_V1, PUAN_V1, izleSha, puanSha, AILE_AD, OZELLIK_AD, ozellik, ozellikler, aileler, kacinTemiz, yuzdelik, hesapla, eskiBul, sirala };
