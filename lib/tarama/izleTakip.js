/**
 * DİKKAT F2 — günlük İZLE (deneme 781) + puan gölgesi (deneme 782) listesi, giren/çıkan, H-DL2/H-DL2P pencereleri ve ön izleme.
 * PLAN-DIKKAT-V1-ONKAYIT.md §3, §4, §5 H-DL2/H-DL2P, §6, EK-1 A4/A6/A7/A8/A9, düzeltme 1–2, EK-2.
 * ═══════════════════════════════════════════════════════════════════════════
 * Günlük arşiv koşusu (lib/tarama/arsiv.js gunlukKos) dikkat dosyalarından hemen sonra `gunluk()` çağrılır:
 *   1) İZLE + puan listesi (lib/tarama/izle.js) → `arsiv/<gün>/izle.json` (manifestin SHA zincirinde — A8)
 *   2) giren / çıkan (önceki kayıt gününün listesine göre; durumu bilinmeyen token için son bilinen durum — İ20, İ29)
 *   3) t0 SONRASI: pencere k = 0…11 başlangıç günü t0 + 30k (kayıt boşluğu → sonraki ilk İZLE günü) — o günün değerlendirme kümesinin
 *      tamamı (giriş fiyatı, kanat, likidite beşte birliği, şart 1, momentum) gün dosyasına yazılır ve 30 gün tutulur (A6).
 *   4) t0 ÖNCESİ (ısınma): listeye YENİ giren her token + aynı gün/kanat/dilimden 3 tohumlu kontrol 30 g izlenir — ÖN İZLEME,
 *      değerlendirme dışı, hüküm değil. t0'dan sonra yeni ön izleme girişi açılmaz (A6: ara raporda performans gösterilmez).
 *   5) HÜKÜM GÜNÜ (t0 + 374) ya da sonraki ilk İZLE koşusunda hüküm BİR KEZ hesaplanır → `arsiv/<gün>/izle-hukum.json` (zincirde);
 *      panel bunu okur, yeniden hesaplamaz (İ24).
 * Türetilmiş durum `dikkat/izle-takip.json` zincire girmez; `takipKur()` gün dosyalarından (dikkat.jsonl + izle.json + evren
 * birleşme satırları) aynısını kurar. Takip dosyası üye GETİRİSİ tutmaz — yalnız fiyat/durum (İ28).
 *
 * HÜKÜM (A6, A7, A9, düzeltme 2): M = pencere başına sepet getirisi medyanlarının medyanı; 1 000 tohumlu eşleştirilmiş rastgele sepet →
 * p = (#{M_j ≥ M} + 1) / 1 001; Holm (781, 782); KABUL(781) ⇔ Holm geçer ∧ M > evren M ∧ M > havuz M. < 5 geçerli pencere → SONUÇSUZ;
 * A4 (P/F + holder 30 g bilinmiyor ≥ %30, 2 ay üst üste) → SONUÇSUZ. 782 tek başına geçerse terfi yok. Bilgi kıyasları (hükümsüz): momentum
 * eşleşmiş sepet, BTC, puan − İZLE, günlük listelerle blok bootstrap duyarlılığı.
 * HÜKÜM GÜNÜNDEN ÖNCE hiçbir getiri farkı / yüzdelik dışarı verilmez (yalnız pencere sayısı, liste boyları, giren/çıkan).
 *
 * Liste bota/portföye/emre bağlanmaz. lib/live, lib/risk'e dokunmaz.
 *
 * ÖLÇÜM NETLEŞTİRMELERİ (2026-10-15, t0 öncesi; hiçbir sepet/getiri hesaplanmadan yazıldı — kural değişikliği değil; İ1–İ9 izle.js'te):
 *   İ10 Pencere k'nın başlangıcı = t0 + 30k günü ya da ondan sonraki ilk İZLE kayıt günü, ama t0 + 30(k + 1)'den önce; o aralıkta
 *       İZLE günü yoksa pencere "başlangıcı bulunamadı" ile düşer. İZLE hesabı başarısız olan gün kayıt boşluğu gibidir.
 *   İ11 Getiri: giriş = başlangıç günü fiyatı (dikkat ölçümü: CEX CoinGecko > DexScreener, DEX tersi), çıkış = başlangıç + 30 gün ya da
 *       sonraki ilk fiyatlı kayıt günü; net = (1 − c)² × çıkış / giriş − 1, c = DEX %1 kayma + %0,3 ücret = 0,013, CEX 0,001 (giriş ve
 *       çıkış birer kez; kanat başlangıç günündeki). Çıkış fiyatının kaynağı girişten farklıysa kayda yazılır.
 *   İ12 Ölü (−%100): tutma süresinde (başlangıç + 1 … + 30) CEX Binance delist / DEX tüm çift likiditesi < 1 000 $ (DexScreener cevap
 *       verdiyse; "çift yok" için İ25), ya da fiyat ve hacim kaybolup (başlangıcı ≤ çıkış günü) 14 gün içinde fiyatla geri dönmeyen token.
 *       Dönerse ölü değil, getiri dönüş fiyatıyla. Çıkış gününden sonra 14 gün fiyat gelmez ama kaybolma da gözlenmezse (kayıt yok /
 *       kaynak cevapsız) "ölçülemedi": medyanlardan düşer, sayısı raporlanır. Girişte fiyatı olmayan token ölçülemedi.
 *   İ13 Sepet medyanı ölçülen üyelerden; ölçülen üyesi olmayan pencere o liste için düşer. "< 5 liste boyu" kuralı yayımlanan liste boyudur.
 *   İ14 Rastgele sepet: aday = başlangıç günü değerlendirme kümesinde şart 1'i sağlayan (KAÇIN temiz) ve getirisi ölçülen token'lar;
 *       her liste üyesi için aynı kanat + likidite beşte birliği (dilim yoksa aynı kanat); sepet içinde tekrarsız, tabaka tükenirse
 *       tekrarlı. Tohum = SHA-256(pencere günü|sürüm|deneme|j)'nin ilk 8 hex'i → mulberry32; üyeler liste sırasıyla.
 *   İ15 İkinci havuz her iki test için A7 tanımı (şart 1 + 2 + P/F; o pencerenin başlangıç günü); evren = o günün değerlendirme
 *       kümesinin tamamı. Rastgele dağılımdaki yüzdelik = (#{M_j < M} + ½ #{M_j = M}) / 1 000. Holm'da SONUÇSUZ testin p'si 1 sayılır.
 *   İ16 A4 (H-DL2/2P): günlük oran = değerlendirme kümesinde P/F ve holder 30 g değerlendirmelerinin bilinmiyor / (bilinmiyor + ok);
 *       P/F bilinmiyor = DefiLlama / ücret ucu / piyasa değeri kaynağı cevap vermedi; holder 30 g bilinmiyor = bugünkü holder kaynağı
 *       cevap vermedi ya da t−33…t−30 aralığında kayıt yok (arşiv o kadar eskiyse). Kapsam t0 … t0 + 359; İZLE kaydı olmayan gün oran 1.
 *   İ17 Ön izleme (yalnız ısınma): İZLE ya da puan listesine YENİ giren token; 3 kontrol = aynı gün, aynı kanat ve beşte birlik, o gün
 *       o listede olmayan, giriş fiyatı olan değerlendirme kümesi token'ı; sıra SHA-256(gün|sürüm|deneme|onizleme|anahtar), bir kontrol
 *       aynı gün aynı listede bir kez. Getiri İ11–İ12. "Kontrolü geçti" = girişin getirisi kendi ölçülen kontrollerinin medyanından büyük.
 *   İ18 Arşiv izlemesi: açık pencere / ön izleme pozisyonundaki (İZLE ve puan) token'lar pozisyon kapanana kadar (en çok başlangıç +
 *       44 gün = 30 + 14), İZLE listesinde görünen token son görüldüğü günden 44 gün evrenden çıksa da izlenir (`takipAnahtarlari`).
 *       Puan listesinde görünmek tek başına izleme uzatmaz (gölge; getirisi yalnız pencere / ön izleme pozisyonlarından ölçülür).
 *   İ19 Giren/çıkan için önceki günlerin İZLE dosyası yoksa (64.3 öncesi ya da hesap hatası) o gün atlanır; geçmiş günler için liste
 *       sonradan üretilmez (A8). İlk İZLE gününde giren/çıkan yoktur (taban).
 *   İ20 Giren/çıkan son bilinen duruma göre (dikkat N2): token'ın İZLE durumu bir günde "bilinir" ⇔ o gün değerlendirme kümesinde ve
 *       yetersiz veri değil (ayrıca İ29); önceki gün bilinmiyorsa daha eski güne bakılır (en çok 7 kayıt günü). Bugün listede olup son
 *       bilinen günde de listede olan giren değildir (girdiği gün korunur). Önceki listede olup bugün durumu bilinmeyen token çıkan
 *       sayılmaz, "askıda" yazılır. Puan listesinin giren/çıkanı aynı kuralla.
 * EK NETLEŞTİRMELER (2026-10-15, bağımsız denetimden sonra; t0 öncesi, hiçbir sepet/getiri hesaplanmadan):
 *   İ21 A6 — ön izleme karnesi: t0 belli ve hüküm günü gelmemişse yalnız tutma süresi (çıkış günü + 14 g kayıp payı dahil) t0'dan
 *       ÖNCE tamamen bitmiş girişler (kontrolleriyle) getiriyle gösterilir; diğerleri yalnız sayılır (t0 sonrası günlerin fiyatı
 *       pencere 0'la örtüşür).
 *   İ22 İZLE listesi 30 g holder geçmişi olmadan (arşiv 30 günden genç) hesaplanamaz: o günlerin İZLE durumu "bilinmiyor" sayılır
 *       (`durumBilinir: false`), yani ilk hesaplanabilen gün İZLE için taban günüdür (giren yok; ön izleme girişi açılmaz). Puan
 *       listesi ilk İZLE dosyalı günden itibaren hesaplanır, onun tabanı ilk İZLE dosyalı gündür.
 *   İ23 Hüküm günü listede, rastgele havuzda ya da evrende hâlâ açık (sonucu belli olmayan) üyesi olan pencere "tamamlanmadı" ile düşer;
 *       kısmi ölçümle hesaba girmez (ölü olabilecek üyeyi atmak yanlılık olurdu).
 *   İ24 Hüküm t0 + 374 günündeki (o gün kayıt yoksa sonraki ilk) İZLE koşusunda BİR KEZ hesaplanır, `arsiv/<gün>/izle-hukum.json`
 *       olarak zincire yazılır; sonradan yeniden hesaplanmaz, panel bu dosyayı okur.
 *   İ25 DexScreener "çift yok" (`bos`) tek günde ölüm sayılmaz: tutma süresinde başlarsa kaybolma gibi 14 gün teyit beklenir (araya
 *       DexScreener'ın çift bulduğu gün girerse sayılmaz; ölüm günü = ilk `bos` günü); teyit beklenirken çıkış yapılmaz.
 *   İ26 Bilgi kıyasları (hükümsüz, yalnız hüküm dosyasında): momentum eşleşmiş sepet (geçmiş 30 g log fiyat değişimi kanat içi beşte
 *       birlikleri; 1 000 tohumlu, tohum SHA-256(gün|sürüm|deneme|momentum|j)); BTC (cex:BTC, aynı maliyet, geçerli pencereler);
 *       puan ilk 15 M − İZLE ilk 15 M; günlük listelerle duyarlılık: her t0 … t0 + 359 günü için (liste medyanı − o gün KAÇIN temiz
 *       küme medyanı) 30 g net getiri farkı (çıkış = gün + 30 … + 44 içindeki ilk İZLE günü; fiyatı olmayan token düşer, ölü kuralı
 *       uygulanmaz — basitleştirilmiş), durağan blok bootstrap (ortalama blok 30 gün, N 2000, tohum 99), %90 aralık.
 *   İ27 Rastgele sepette "ölçülemedi" liste üyesi için çekme yapılmaz (sepet boyu = ölçülen liste üyesi sayısı). Boş kalan M_j
 *       p'de muhafazakâr olarak "≥ M" sayılır ve sayısı raporlanır.
 *   İ28 Körlük: takip dosyası hüküm gününden önce getiri tutmaz; yalnız giriş/çıkış fiyatı ve ölü / ölçülemedi durumu. Getiri hüküm
 *       günü (ön izlemede karnede) bu fiyatlardan hesaplanır.
 *   İ29 "Bilinir" (İ20) ayrıca İZLE'nin kendi aile kaynaklarını ister: o gün holder 30 g değişimi ya da P/F "bilinmiyor" (kaynak cevap
 *       vermedi) ise token'ın durumu bilinmez — listeden düşse de çıkan değil askıdadır. Gün dosyasında `bilinmeyen` olarak saklanır.
 */
'use strict';
const path = require('path');
const D = require('./dikkat');
const DT = require('./dikkatTakip');
const IZ = require('./izle');
const { jsonOku, sha256, gunStr, medyan } = require('./ortak');

const V = IZ.IZLE_V1.deger;
const GUN = 864e5;
const gunEkle = (g, n) => gunStr(Date.parse(`${g}T00:00:00Z`) + n * GUN);
const fark = D.gunFark;
const pozitif = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const TESTLER = Object.freeze([
  Object.freeze({ ad: 'izle', alan: 'liste', surum: IZ.IZLE_V1.surum, deneme: IZ.IZLE_V1.deneme, kimlik: 'H-DL2' }),
  Object.freeze({ ad: 'puan', alan: 'puanListe', surum: IZ.PUAN_V1.surum, deneme: IZ.PUAN_V1.deneme, kimlik: 'H-DL2P' }),
]);
const BOOT = Object.freeze({ blok: 30, n: 2000, tohum: 99, guven: 0.90 });

// ── Dosyalar ─────────────────────────────────────────────────────────────
function yollar(kok) { return { takip: path.join(kok, 'dikkat', 'izle-takip.json') }; }
function bosTakip() { return { surum: 2, sonGun: null, t0: null, pencereler: {}, onizleme: [], uyeSon: {}, gunler: [] }; }
function takipOku(kok) { return jsonOku(yollar(kok).takip, null) || bosTakip(); }
const jsonl = (b) => (b ? b.toString('utf8').split('\n').filter(s => s.trim()).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean) : []);
const json = (b) => { try { return b ? JSON.parse(b.toString('utf8')) : null; } catch { return null; } };
const hukumGunu = (t0) => (t0 ? gunEkle(t0, V.hukumGun) : null);

/** Arşivin evrenden çıksa da izlemesi gereken token'lar (İ18). */
function takipAnahtarlari(kok, gun) {
  const t = takipOku(kok);
  const out = new Set();
  const sure = V.tutGun + V.kayipGun;
  for (const w of Object.values(t.pencereler || {})) for (const [a, p] of Object.entries(w.uyeler || {})) if (!p.sonuc && (!gun || fark(p.bas, gun) <= sure)) out.add(a);
  for (const p of t.onizleme || []) if (!p.sonuc && (!gun || fark(p.bas, gun) <= sure)) out.add(p.anahtar);
  for (const [a, g] of Object.entries(t.uyeSon || {})) if (!gun || fark(g, gun) <= sure) out.add(a);
  return out;
}

// ── Pozisyon (İ11, İ12, İ25, İ28 — getiri TUTULMAZ) ────────────────────
function pozisyon(bas, kanat, m) {
  const p0 = m && pozitif(m.fiyat) ? m.fiyat : null;
  return { bas, hedef: gunEkle(bas, V.tutGun), kanat, c: kanat === 'cex' ? V.maliyet.cex : V.maliyet.dex, p0, k0: p0 != null ? m.fiyatKaynak || null : null,
    kayipBas: null, bosBas: null, sonuc: p0 == null ? 'olculemedi' : null, cikisGun: null, ...(p0 == null ? { neden: 'girişte fiyat yok' } : {}) };
}
const olum = (p, gun, neden) => Object.assign(p, { sonuc: 'olu', cikisGun: gun, neden });
/** Pozisyonu bugünün ölçümüyle ilerlet. m = dikkat ölçümü | null (token bugün kayıtta yok). */
function pozIlerlet(p, gun, m) {
  if (p.sonuc || gun <= p.bas) return;
  const icinde = gun <= p.hedef;
  if (m) {
    if (icinde && p.kanat === 'cex' && m.delist === true) { olum(p, gun, 'Binance delist'); return; }
    if (icinde && p.kanat === 'dex' && m.likiditeD === 'ok' && Number.isFinite(m.likidite) && m.likidite < V.dexLikiditeAlt) { olum(p, gun, `DEX likiditesi < ${V.dexLikiditeAlt} $`); return; }
    if (p.kanat === 'dex') { if (m.likiditeD === 'bos') { if (!p.bosBas && icinde) p.bosBas = gun; } else if (m.likiditeD === 'ok') p.bosBas = null; }
    if (pozitif(m.fiyat)) {
      p.kayipBas = null;
      if (gun >= p.hedef && !p.bosBas) {
        Object.assign(p, { sonuc: 'tamam', cikisGun: gun, cikisFiyat: m.fiyat, ...(m.fiyatKaynak !== p.k0 ? { cikisKaynak: m.fiyatKaynak } : {}) });
        return;
      }
    } else if (m.fiyatYok === true && !p.kayipBas && icinde) p.kayipBas = gun;
  }
  if (p.bosBas && fark(p.bosBas, gun) >= V.kayipGun) { olum(p, p.bosBas, `DexScreener'da çift yok ${p.bosBas} tarihinden beri (≥ ${V.kayipGun} g)`); return; }
  if (p.kayipBas && fark(p.kayipBas, gun) >= V.kayipGun) { olum(p, p.kayipBas, `fiyat ve hacim ${p.kayipBas} tarihinden beri yok (≥ ${V.kayipGun} g)`); return; }
  if (!p.kayipBas && !p.bosBas && fark(p.hedef, gun) >= V.kayipGun) Object.assign(p, { sonuc: 'olculemedi', neden: `çıkış gününden sonra ${V.kayipGun} gün fiyat yok` });
}
const olculdu = (p) => p && (p.sonuc === 'tamam' || p.sonuc === 'olu');
/** Net getiri (İ11) — yalnız hüküm günü / ön izleme karnesinde hesaplanır (İ28). */
const getiri = (p) => (!p ? null : p.sonuc === 'olu' ? -1 : p.sonuc === 'tamam' && pozitif(p.p0) && pozitif(p.cikisFiyat) ? (1 - p.c) * (1 - p.c) * (p.cikisFiyat / p.p0) - 1 : null);

// ── Giren / çıkan (İ19, İ20, İ22, İ29) ───────────────────────────────────
/**
 * @param bugun [anahtar] bugünün listesi (sıralı), @param bilinen Set — bugün durumu bilinen
 * @param onceki [{ gun, liste: Map(anahtar → girisGun) | null, bilinen: Set }] YENİDEN ESKİYE (≤ 7)
 * @returns { girenler, cikanlar, askida, giris: Map(anahtar → girisGun), taban }
 */
function gecis(bugun, bilinen, onceki, gun) {
  const veri = (onceki || []).filter(d => d.liste);
  const giris = new Map();
  if (!veri.length) { for (const a of bugun) giris.set(a, gun); return { girenler: [], cikanlar: [], askida: [], giris, taban: true }; }
  const durum = (a) => { for (const d of veri) { if (d.liste.has(a)) return { on: true, giris: d.liste.get(a) }; if (d.bilinen && d.bilinen.has(a)) return { on: false }; } return null; };
  const girenler = [];
  for (const a of bugun) { const d = durum(a); if (d && d.on) giris.set(a, d.giris || gun); else { girenler.push(a); giris.set(a, gun); } }
  const bugunS = new Set(bugun);
  const aday = new Set(); for (const d of veri) for (const a of d.liste.keys()) aday.add(a);
  const cikanlar = [], askida = [];
  for (const a of [...aday].sort()) {
    if (bugunS.has(a)) continue;
    const d = durum(a);
    if (!d || !d.on) continue;
    if (bilinen.has(a)) cikanlar.push(a); else askida.push(a);
  }
  return { girenler, cikanlar, askida, giris, taban: false };
}

// ── Günlük adım ──────────────────────────────────────────────────────────
/**
 * @param o { gun, satirlar: dikkat satırları (m = olcum + izle.ozellik), evren, esikler, gecmis, gecmisVar, onceki, takip, birlesme,
 *            hukumVar: bool (zincirde izle-hukum.json var mı), gunDosyalari: () => Map(gun → izle.json) (yalnız hüküm günü çağrılır) }
 * @returns { dosya: izle.json nesnesi, takip, hukum: izle-hukum.json nesnesi | null } — DOSYA YAZMAZ
 */
function gunluk(o) {
  const { gun } = o;
  const t = o.takip || bosTakip();
  const esikler = o.esikler || null;
  const t0 = esikler && esikler.t0 ? esikler.t0 : null;
  const isinma = !t0 || gun < t0;
  const kume = DT.kume(o.evren, esikler, isinma);
  const satirlar = o.satirlar || [];
  const gecmisVar = o.gecmisVar !== false;
  const h = IZ.hesapla({ gun, satirlar, gecmis: o.gecmis || [], gecmisVar, dilim: kume });
  // İ29: durumu bilinen = değerlendirme kümesinde, yetersiz değil, holder 30 g ve P/F kaynakları cevap verdi
  const bilinmeyen = new Set(h.kayit.filter(x => x.s.yetersiz || x.oz.holder30D === 'bilinmiyor' || x.oz.pfD === 'bilinmiyor').map(x => x.s.anahtar));
  const bilinen = new Set(h.kayit.map(x => x.s.anahtar).filter(a => !bilinmeyen.has(a)));
  const onc = o.onceki || [];
  // İ22: 30 g geçmişi olmayan gün İZLE için durum bilinmez → ilk hesaplanabilen gün taban
  const gL = gecmisVar ? gecis(h.liste.map(x => x.anahtar), bilinen, onc.map(d => ({ gun: d.gun, liste: d.liste, bilinen: d.bilinen })), gun)
    : { girenler: [], cikanlar: [], askida: [], giris: new Map(), taban: true };
  const gP = gecis(h.puanListe.map(x => x.anahtar), bilinen, onc.map(d => ({ gun: d.gun, liste: d.puan, bilinen: d.bilinen })), gun);
  for (const x of h.liste) x.girisGun = gL.giris.get(x.anahtar) || gun;
  for (const x of h.puanListe) x.girisGun = gP.giris.get(x.anahtar) || gun;
  const sembol = new Map(satirlar.map(s => [s.anahtar, s.sembol || null]));
  const etiket = (a) => ({ anahtar: a, sembol: sembol.get(a) || null });

  // 1) açık pozisyonlar (bugünün ölçümüyle; bugün açılanlar ilerlemez)
  const mH = new Map(satirlar.map(s => [s.anahtar, s.m]));
  const birlesme = o.birlesme || {};
  const mAl = (a) => mH.get(a) || (birlesme[a] ? mH.get(birlesme[a]) : null) || null;
  ilerlet(t, gun, mAl);

  // 2) H-DL2 penceresi (t0 sonrası)
  let pencereAc = null;
  if (!isinma) {
    const k = Math.floor(fark(t0, gun) / V.tutGun);
    if (k >= 0 && k < V.pencereSayi && !t.pencereler[k]) {
      const temiz = new Set(h.kayit.filter(x => x.sart1).map(x => x.s.anahtar));
      const mom = new Map(h.kayit.map(x => [x.s.anahtar, x.oz.momentum30]));
      const uyeler = satirlar.filter(s => s.evrende).map(s => [s.anahtar, s.kanat, kume.has(s.anahtar) && Number.isFinite(kume.get(s.anahtar).dilim) ? kume.get(s.anahtar).dilim : null, temiz.has(s.anahtar) ? 1 : 0,
        s.m && pozitif(s.m.fiyat) ? s.m.fiyat : null, s.m && pozitif(s.m.fiyat) ? s.m.fiyatKaynak || null : null, Number.isFinite(mom.get(s.anahtar)) ? mom.get(s.anahtar) : null]);
      pencereAc = { k, uyeler };
      pencereKur(t, gun, k, h.liste.map(x => x.anahtar), h.puanListe.map(x => x.anahtar), h.havuz, uyeler);
    }
  }

  // 3) ön izleme (yalnız ısınma; İ17)
  const onIzleme = [];
  if (isinma) {
    for (const [ad, liste, gr] of [['izle', h.liste, gL], ['puan', h.puanListe, gP]]) {
      const test = TESTLER.find(x => x.ad === ad);
      const listede = new Set(liste.map(x => x.anahtar));
      const havuz = satirlar.filter(s => s.evrende && !listede.has(s.anahtar) && s.m && pozitif(s.m.fiyat) && kume.has(s.anahtar) && Number.isFinite(kume.get(s.anahtar).dilim))
        .map(s => ({ s, d: kume.get(s.anahtar).dilim, h: sha256(`${gun}|${test.surum}|${test.deneme}|onizleme|${s.anahtar}`) })).sort((a, b) => a.h.localeCompare(b.h));
      const secildi = new Set();
      for (const a of gr.girenler) {
        const s = satirlar.find(x => x.anahtar === a);
        const u = kume.get(a);
        const dl = u && Number.isFinite(u.dilim) ? u.dilim : null;
        const kontroller = [];
        for (const c of havuz) {
          if (kontroller.length >= V.onIzlemeKontrol) break;
          if (dl == null || c.s.kanat !== s.kanat || c.d !== dl || secildi.has(c.s.anahtar)) continue;
          secildi.add(c.s.anahtar);
          kontroller.push([c.s.anahtar, c.s.sembol || null, c.s.kanat, c.d, c.s.m.fiyat, c.s.m.fiyatKaynak || null]);
        }
        const g = { liste: ad, anahtar: a, sembol: s.sembol || null, kanat: s.kanat, dilim: dl, p0: s.m && pozitif(s.m.fiyat) ? s.m.fiyat : null, k0: s.m && pozitif(s.m.fiyat) ? s.m.fiyatKaynak || null : null, kontroller };
        onIzleme.push(g);
        onIzlemeKur(t, gun, g);
      }
    }
  }

  // 4) izleme kümesi (İ18) + seri
  for (const x of h.liste) t.uyeSon[x.anahtar] = gun;
  for (const [a, g] of Object.entries(t.uyeSon)) if (fark(g, gun) > V.tutGun + V.kayipGun) delete t.uyeSon[a];
  t.sonGun = gun; t.t0 = t0;
  t.gunler = [...(t.gunler || []).filter(x => x.gun !== gun), { gun, liste: h.liste.length, puan: h.puanListe.length, aday: h.aday, havuz: h.havuz.length, kume: h.kume,
    giren: gL.girenler.length, cikan: gL.cikanlar.length, oran: h.payda.oran, isinma }].slice(-400);

  const dosya = {
    gun, surum: IZ.IZLE_V1.surum, deneme: IZ.IZLE_V1.deneme, puanSurum: IZ.PUAN_V1.surum, puanDeneme: IZ.PUAN_V1.deneme,
    izleSha: IZ.izleSha(), puanSha: IZ.puanSha(), kurallarSha: D.kurallarSha(), isinma, t0, durumBilinir: gecmisVar,
    oncekiGun: (onc.find(d => d.liste || d.puan) || {}).gun || null, gecmisGun: (o.gecmis || []).map(g => g.gun),
    kume: h.kume, aday: h.aday, havuzSayi: h.havuz.length, puanKapsam: h.puanKapsam, sayim: h.sayim, payda: h.payda,
    liste: h.liste, puanListe: h.puanListe, havuz: h.havuz, bilinmeyen: [...bilinmeyen].sort(),
    girenler: gL.girenler.map(etiket), cikanlar: gL.cikanlar.map(etiket), askida: gL.askida.map(etiket), taban: gL.taban, puanTaban: gP.taban,
    puanGirenler: gP.girenler.map(etiket), puanCikanlar: gP.cikanlar.map(etiket), puanAskida: gP.askida.map(etiket),
    ...(pencereAc ? { pencereAc } : {}), ...(onIzleme.length ? { onIzleme } : {}),
    // t0 sonrası: hüküm gününün bilgi kıyasları (İ26) için günün fiyatları ve KAÇIN temiz küme (zincirde)
    ...(!isinma ? { fiyatlar: Object.fromEntries(satirlar.filter(s => s.m && pozitif(s.m.fiyat)).map(s => [s.anahtar, s.m.fiyat])),
      temizKume: h.kayit.filter(x => x.sart1).map(x => [x.s.anahtar, x.s.kanat]) } : {}),
    bosNeden: h.liste.length ? null : bosNeden(h, o),
  };
  // 5) hüküm (İ24): t0 + 374 ya da sonraki ilk İZLE günü, zincirde henüz yoksa BİR KEZ
  let hukum = null;
  if (!isinma && gun >= hukumGunu(t0) && !o.hukumVar) {
    const gm = o.gunDosyalari ? o.gunDosyalari() : new Map();
    gm.set(gun, dosya);
    hukum = hdl2Hukum(t, gun, gm);
  }
  return { dosya, takip: t, hukum };
}

/** Boş İZLE listesinin sade nedeni (panel bunu gösterir). */
function bosNeden(h, o) {
  const s = h.sayim;
  if (!s.kume) return 'değerlendirme kümesinde token yok';
  if (o.gecmisVar === false || !s.holder30) return 'holder 30 g değişimi hesaplanamıyor: 30 gün önceki kayıt günü yok (ilk liste ≈ 30 kayıt günü sonra)';
  if (!s.aday) return 'KAÇIN temiz ve en az 3 ailede verisi olan token yok';
  if (!s.havuz) return 'adaylarda P/F yok (DefiLlama ücreti > 0 olan aday yok)';
  if (!s.holder30Arti) return 'P/F\'si olan adayların hiçbirinde holder sayısı 30 günde artmamış';
  return 'P/F kategori yüzdeliği ≤ %20 ve holder 30 g artışı olan aday yok';
}

function pencereKur(t, gun, k, liste, puanListe, havuz, uyeler) {
  const u = {};
  for (const [a, kanat, dilim, temiz, p0, k0, mom] of uyeler) u[a] = { ...pozisyon(gun, kanat, { fiyat: p0, fiyatKaynak: k0 }), dilim, temiz: !!temiz, mom: Number.isFinite(mom) ? mom : null };
  t.pencereler[k] = { k, gun, liste, puanListe, havuz, uyeler: u };
}
function onIzlemeKur(t, gun, g) {
  const id = `${gun}:${g.liste}:${g.anahtar}`;
  t.onizleme.push({ id, gun, liste: g.liste, rol: 'giris', anahtar: g.anahtar, sembol: g.sembol, dilim: g.dilim, ...pozisyon(gun, g.kanat, { fiyat: g.p0, fiyatKaynak: g.k0 }) });
  for (const [a, sembol, kanat, dilim, p0, k0] of g.kontroller || []) t.onizleme.push({ id: `${id}:k:${a}`, girisId: id, gun, liste: g.liste, rol: 'kontrol', anahtar: a, sembol, dilim, ...pozisyon(gun, kanat, { fiyat: p0, fiyatKaynak: k0 }) });
}
function ilerlet(t, gun, mAl) {
  for (const w of Object.values(t.pencereler || {})) for (const [a, p] of Object.entries(w.uyeler || {})) pozIlerlet(p, gun, mAl(a));
  for (const p of t.onizleme || []) pozIlerlet(p, gun, mAl(p.anahtar));
}

// ── Gün dosyalarından okuma ──────────────────────────────────────────────
/** Bir günün ölçümleri: dikkat.jsonl `m` (64.3 öncesi satırda İZLE alanı yoksa anlik.jsonl'dan tamamlanır), yoksa anlik.jsonl'dan. */
function gunOlcum(kok, g, dosyaOku) {
  const m = new Map();
  const dk = jsonl(dosyaOku(kok, `arsiv/${g}/dikkat.jsonl`));
  const eksik = !dk.length || dk.some(r => !r.m || !('ucretD' in r.m));
  const anlik = eksik ? new Map(jsonl(dosyaOku(kok, `arsiv/${g}/anlik.jsonl`)).map(r => [r.anahtar, r])) : null;
  if (dk.length) for (const r of dk) m.set(r.anahtar, r.m && !('ucretD' in r.m) && anlik && anlik.has(r.anahtar) ? { ...r.m, ...IZ.ozellik(anlik.get(r.anahtar)) } : r.m);
  else if (anlik) for (const [a, row] of anlik) m.set(a, { ...D.olcum(row), ...IZ.ozellik(row) });
  return m;
}
/** İ5: [t−33, t−30] aralığındaki kayıt günleri (yeniden eskiye) + arşivin o kadar eski olup olmadığı. */
function gecmisGunler(kok, manifestSatirlari, gun, dosyaOku) {
  const kayit = manifestSatirlari.filter(k => k.tur === 'gun' && k.gun < gun).map(k => k.gun);
  const alt = gunEkle(gun, -(IZ.IZLE_V1.degisimGun + IZ.IZLE_V1.geriGun)), ust = gunEkle(gun, -IZ.IZLE_V1.degisimGun);
  const secilen = kayit.filter(g => g >= alt && g <= ust).sort().reverse();
  const ilk = kayit.length ? kayit.slice().sort()[0] : null;
  return { gunler: secilen.map(g => ({ gun: g, m: gunOlcum(kok, g, dosyaOku) })), gecmisVar: !!ilk && ilk <= ust };
}
/** Önceki kayıt günlerinin İZLE/puan listeleri (girisGun ile) + o günün bilinen kümesi (dikkat durumu − İZLE `bilinmeyen`; İ22, İ29). */
function oncekiIzle(kok, durum, dosyaOku) {
  return (durum || []).map(d => {
    const z = json(dosyaOku(kok, `arsiv/${d.gun}/izle.json`));
    const harita = (l) => new Map((l || []).map(x => [x.anahtar, x.girisGun || d.gun]));
    const bil = new Set(d.bilinen || []);
    if (z) for (const a of z.bilinmeyen || []) bil.delete(a);
    return { gun: d.gun, liste: z && z.durumBilinir !== false ? harita(z.liste) : null, puan: z ? harita(z.puanListe) : null, bilinen: bil };
  });
}
/** Manifestte izle-hukum.json var mı (İ24). @returns { gun, yol } | null */
function hukumKaydi(manifestSatirlari, dosyaAd = 'izle-hukum.json') {
  for (const k of manifestSatirlari || []) if (k.tur === 'gun') { const d = (k.dosyalar || []).find(x => x.yol === `arsiv/${k.gun}/${dosyaAd}`); if (d) return { gun: k.gun, yol: d.yol }; }
  return null;
}
/** Hüküm günü bilgi kıyasları için t0 … bugün İZLE gün dosyaları (yalnız hüküm günü bir kez okunur). */
function gunDosyalariOku(kok, manifestSatirlari, t0, dosyaOku) {
  const out = new Map();
  for (const g of izleGunleri(manifestSatirlari)) if (!t0 || g >= t0) { const z = json(dosyaOku(kok, `arsiv/${g}/izle.json`)); if (z) out.set(g, z); }
  return out;
}

// ── Takip durumunun gün dosyalarından kurulması ──────────────────────────
const izleGunleri = (manifestSatirlari, once) => manifestSatirlari
  .filter(k => k.tur === 'gun' && (!once || k.gun < once) && (k.dosyalar || []).some(d => /\/izle\.json$/.test(d.yol))).map(k => k.gun);

/**
 * `izle-takip.json` türetilmiştir: her İZLE günü için o günün dikkat ölçümleriyle (DEX→CEX birleşme eşlemesi evren dosyalarının
 * `birlesti` satırlarından birikir — N15) pozisyonlar ilerletilir, sonra izle.json'daki pencere / ön izleme açılır.
 */
function takipKur(kok, manifestSatirlari, bugun, dosyaOku) {
  const t = bosTakip();
  const birlesme = {};
  const izleSet = new Set(izleGunleri(manifestSatirlari, bugun));
  for (const k of manifestSatirlari.filter(x => x.tur === 'gun' && (!bugun || x.gun < bugun))) {
    const g = k.gun;
    Object.assign(birlesme, DT.birlesmeOku(kok, g, dosyaOku));
    if (!izleSet.has(g)) continue;
    const z = json(dosyaOku(kok, `arsiv/${g}/izle.json`));
    if (!z) continue;
    const m = new Map(jsonl(dosyaOku(kok, `arsiv/${g}/dikkat.jsonl`)).map(r => [r.anahtar, r.m]));
    ilerlet(t, g, (a) => m.get(a) || (birlesme[a] ? m.get(birlesme[a]) : null) || null);
    if (z.pencereAc) pencereKur(t, g, z.pencereAc.k, (z.liste || []).map(x => x.anahtar), (z.puanListe || []).map(x => x.anahtar), z.havuz || [], z.pencereAc.uyeler || []);
    for (const oi of z.onIzleme || []) onIzlemeKur(t, g, oi);
    for (const x of z.liste || []) t.uyeSon[x.anahtar] = g;
    for (const [a, gg] of Object.entries(t.uyeSon)) if (fark(gg, g) > V.tutGun + V.kayipGun) delete t.uyeSon[a];
    t.gunler.push({ gun: g, liste: (z.liste || []).length, puan: (z.puanListe || []).length, aday: z.aday, havuz: z.havuzSayi, kume: z.kume, giren: (z.girenler || []).length, cikan: (z.cikanlar || []).length, oran: z.payda ? z.payda.oran : null, isinma: z.isinma });
    t.sonGun = g; t.t0 = z.t0 || null;
  }
  t.gunler = t.gunler.slice(-400);
  t.kuruldu = { zaman: new Date().toISOString(), kaynak: 'gün dosyaları' };
  return t;
}
function takipHazirla(kok, manifestSatirlari, bugun, dosyaOku) {
  const g = izleGunleri(manifestSatirlari, bugun);
  const son = g[g.length - 1] || null;
  const t = takipOku(kok);
  if ((t.sonGun || null) === son && t.surum === bosTakip().surum) return { takip: t, kuruldu: false };
  return { takip: takipKur(kok, manifestSatirlari, bugun, dosyaOku), kuruldu: true };
}

// ── Ön izleme karnesi (ısınma; değerlendirme dışı — İ21) ─────────────────
/** @param o { t0, gun } — t0 belli ve gün < hüküm: yalnız tutma süresi + 14 g t0'dan ÖNCE bitmiş girişler getiriyle gösterilir. */
function onIzlemeKarne(t, liste = 'izle', o = {}) {
  const t0 = o.t0 || t.t0 || null;
  const gizliMi = (p) => !!t0 && (!o.gun || o.gun < hukumGunu(t0)) && gunEkle(p.hedef, V.kayipGun) >= t0;
  const l = (t.onizleme || []).filter(p => p.liste === liste);
  const tumGiris = l.filter(p => p.rol === 'giris');
  const giris = tumGiris.filter(p => !gizliMi(p));
  const olgun = giris.filter(olculdu);
  const kontrol = l.filter(p => p.rol === 'kontrol' && !gizliMi(p));
  let kiyas = 0, gecti = 0;
  const satir = giris.slice(-200).map(p => {
    const ks = kontrol.filter(k => k.girisId === p.id);
    const km = medyan(ks.filter(olculdu).map(getiri));
    if (olculdu(p) && km != null) { kiyas++; if (getiri(p) > km) gecti++; }
    return { gun: p.gun, anahtar: p.anahtar, sembol: p.sembol, kanat: p.kanat, durum: p.sonuc || 'izleniyor', getiri: olculdu(p) ? getiri(p) : null, kontrolMedyan: km, kontrolSayi: ks.length, hedef: p.hedef };
  });
  return {
    not: 'ön izleme (ısınma) — değerlendirme dışı, hüküm değil',
    giris: giris.length, olgun: olgun.length, izleniyor: giris.filter(p => !p.sonuc).length, olculemedi: giris.filter(p => p.sonuc === 'olculemedi').length, olu: olgun.filter(p => p.sonuc === 'olu').length,
    gizli: tumGiris.length - giris.length,
    listeMedyan: medyan(olgun.map(getiri)), kontrolMedyan: medyan(kontrol.filter(olculdu).filter(k => olgun.some(p => p.id === k.girisId)).map(getiri)),
    kiyas, gecti, gecenPay: kiyas ? gecti / kiyas : null, satirlar: satir.reverse(),
  };
}

// ── H-DL2 / H-DL2P (A6, A7, A9) ──────────────────────────────────────────
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const tohum = (gun, test, j) => parseInt(sha256(`${gun}|${test.surum}|${test.deneme}|${j}`).slice(0, 8), 16);

/** Pencerenin rastgele sepeti (İ14, İ27): ölçülen liste üyeleri için tabakadan çekim. @param tabaka Map(anahtar → [aday]) @param anahtarFn (üye) → [tabaka anahtarı, yedek] */
function rastgeleSepet(w, liste, test, j, tabaka, o = {}) {
  const r = mulberry(o.tohum != null ? o.tohum : tohum(w.gun, test, j));
  const tabakaAnahtari = o.anahtar || ((u) => [`${u.kanat}|${u.dilim}`, `${u.kanat}|*`]);
  const kullan = new Set();
  const out = [];
  for (const a of liste) {
    const u = w.uyeler[a];
    if (!u || !olculdu(u)) continue;   // İ27: ölçülemeyen liste üyesi için çekim yok
    const [k1, k2] = tabakaAnahtari(u);
    let havuz = (k1 && tabaka.get(k1)) || [];
    if (!havuz.length) havuz = tabaka.get(k2) || [];
    if (!havuz.length) continue;
    const bos = havuz.filter(x => !kullan.has(x));
    const sec = bos.length ? bos[Math.floor(r() * bos.length)] : havuz[Math.floor(r() * havuz.length)];
    kullan.add(sec);
    out.push(getiri(w.uyeler[sec]));
  }
  return out;
}
function tabakaKur(w) {
  const t = new Map();
  for (const [a, u] of Object.entries(w.uyeler || {}).sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    if (!u.temiz || !olculdu(u)) continue;
    for (const k of [`${u.kanat}|${u.dilim}`, `${u.kanat}|*`]) { if (!t.has(k)) t.set(k, []); t.get(k).push(a); }
  }
  return t;
}
/** Momentum beşte birlikleri (kanat içi, momentumu olan tüm küme üyeleri) → tabaka (İ26, bilgi). */
function momTabaka(w) {
  const q = new Map();
  for (const kanat of ['cex', 'dex']) {
    const l = Object.entries(w.uyeler || {}).filter(([, u]) => u.kanat === kanat && Number.isFinite(u.mom)).sort((a, b) => a[1].mom - b[1].mom || (a[0] < b[0] ? -1 : 1));
    l.forEach(([a], i) => q.set(a, Math.min(4, Math.floor((i * 5) / l.length))));
  }
  const t = new Map();
  for (const [a, u] of Object.entries(w.uyeler || {}).sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    if (!u.temiz || !olculdu(u)) continue;
    for (const k of [q.has(a) ? `${u.kanat}|m${q.get(a)}` : null, `${u.kanat}|*`].filter(Boolean)) { if (!t.has(k)) t.set(k, []); t.get(k).push(a); }
  }
  const geri = new Map(Object.entries(w.uyeler || {}).map(([a, u]) => [u, a]));
  return { tabaka: t, anahtar: (u) => { const a = geri.get(u); return [q.has(a) ? `${u.kanat}|m${q.get(a)}` : null, `${u.kanat}|*`]; } };
}
const sepetMedyani = (w, anahtarlar) => medyan(anahtarlar.map(a => w.uyeler[a]).filter(olculdu).map(getiri));

/** Holm (2 test): p'ler küçükten büyüğe; i. küçük p ≤ α/(m − i) ise reddedilir, ilk tutmayanda durur. */
function holm(pler, alfa = V.alfa) {
  const s = pler.map((p, i) => ({ p: p == null ? 1 : p, i })).sort((a, b) => a.p - b.p);
  const out = pler.map(() => false);
  for (let r = 0; r < s.length; r++) { if (s[r].p <= alfa / (s.length - r)) out[s[r].i] = true; else break; }
  return out;
}

/** Bir test için geçerli pencereler (A6, İ13, İ23). */
function gecerliPencereler(t, test) {
  const ws = Object.values(t.pencereler || {}).sort((a, b) => a.k - b.k);
  const dusen = [], gecerli = [];
  for (let k = 0; k < V.pencereSayi; k++) {
    const w = ws.find(x => x.k === k);
    if (!w) { dusen.push({ k, neden: 'başlangıcı bulunamadı' }); continue; }
    const L = w[test.alan] || [];
    if (L.length < V.asgariBoy) { dusen.push({ k, gun: w.gun, neden: `liste boyu ${L.length} < ${V.asgariBoy}` }); continue; }
    const acik = Object.values(w.uyeler || {}).filter(p => !p.sonuc).length;
    if (acik) { dusen.push({ k, gun: w.gun, neden: `tamamlanmadı (${acik} üye hâlâ açık)` }); continue; }
    if (sepetMedyani(w, L) == null) { dusen.push({ k, gun: w.gun, neden: 'ölçülen üye yok' }); continue; }
    gecerli.push(w);
  }
  return { gecerli, dusen };
}

/** Bir test için ölçüt (A7). @returns { durum: 'SONUCSUZ'|'olculdu', M, Mevren, Mhavuz, p, yuzdelik, gecerli, dusen, bosMj } */
function testOlc(t, test) {
  const { gecerli, dusen } = gecerliPencereler(t, test);
  if (gecerli.length < V.asgariPencere) return { durum: 'SONUCSUZ', neden: `geçerli pencere ${gecerli.length} < ${V.asgariPencere}`, gecerli: gecerli.length, dusen };
  const M = medyan(gecerli.map(w => sepetMedyani(w, w[test.alan])));
  const Mevren = medyan(gecerli.map(w => sepetMedyani(w, Object.keys(w.uyeler))));
  const Mhavuz = medyan(gecerli.map(w => sepetMedyani(w, w.havuz || [])));
  const tab = gecerli.map(tabakaKur);
  const Mj = [];
  for (let j = 0; j < V.rastgele; j++) Mj.push(medyan(gecerli.map((w, i) => medyan(rastgeleSepet(w, w[test.alan], test, j, tab[i])))));
  const bosMj = Mj.filter(x => x == null).length;
  const ust = Mj.filter(x => x == null || x >= M).length;   // İ27: boş M_j muhafazakâr "≥ M"
  const p = (ust + 1) / (V.rastgele + 1);
  const yuzdelik = (Mj.filter(x => x != null && x < M).length + 0.5 * Mj.filter(x => x === M).length) / V.rastgele;
  const olculemedi = gecerli.reduce((s, w) => s + w[test.alan].filter(a => w.uyeler[a] && w.uyeler[a].sonuc === 'olculemedi').length, 0);
  return { durum: 'olculdu', M, Mevren, Mhavuz, p, yuzdelik, gecerli: gecerli.length, dusen, olculemedi, bosMj, pencereM: gecerli.map(w => ({ k: w.k, gun: w.gun, M: sepetMedyani(w, w[test.alan]) })) };
}

/** Bilgi: momentum eşleşmiş sepet (İ26). */
function momentumBilgi(t, test) {
  const { gecerli } = gecerliPencereler(t, test);
  if (!gecerli.length) return null;
  const tb = gecerli.map(momTabaka);
  const Mj = [];
  for (let j = 0; j < V.rastgele; j++) Mj.push(medyan(gecerli.map((w, i) => medyan(rastgeleSepet(w, w[test.alan], test, j, tb[i].tabaka, { anahtar: tb[i].anahtar, tohum: parseInt(sha256(`${w.gun}|${test.surum}|${test.deneme}|momentum|${j}`).slice(0, 8), 16) })))));
  const M = medyan(gecerli.map(w => sepetMedyani(w, w[test.alan])));
  return { Mmomentum: medyan(Mj), yuzdelik: M == null ? null : Mj.filter(x => x != null && x < M).length / V.rastgele, pencere: gecerli.length };
}
/** Bir günden 30 g sonraki (≤ 44 g) ilk İZLE günü. */
function cikisGunu(gunMap, g) {
  const alt = gunEkle(g, V.tutGun), ust = gunEkle(g, V.tutGun + V.kayipGun);
  return [...gunMap.keys()].filter(x => x >= alt && x <= ust).sort()[0] || null;
}
const netR = (p0, p1, kanat) => (pozitif(p0) && pozitif(p1) ? Math.pow(1 - (kanat === 'cex' ? V.maliyet.cex : V.maliyet.dex), 2) * (p1 / p0) - 1 : null);
/** Bilgi: BTC (cex:BTC) geçerli pencerelerde 30 g net getiri medyanı (İ26). */
function btcBilgi(t, test, gunMap) {
  const { gecerli } = gecerliPencereler(t, test);
  const r = gecerli.map(w => {
    const u = w.uyeler['cex:BTC'];
    if (u && olculdu(u)) return getiri(u);
    const z0 = gunMap.get(w.gun), e = cikisGunu(gunMap, w.gun), z1 = e ? gunMap.get(e) : null;
    return z0 && z1 && z0.fiyatlar && z1.fiyatlar ? netR(z0.fiyatlar['cex:BTC'], z1.fiyatlar['cex:BTC'], 'cex') : null;
  });
  return { Mbtc: medyan(r), pencere: r.filter(x => x != null).length };
}
/** Bilgi: günlük listelerle (liste − KAÇIN temiz küme) 30 g fark serisi, durağan blok bootstrap (İ26). */
function duyarlilik(test, gunMap, t0) {
  const son = gunEkle(t0, V.pencereSayi * V.tutGun - 1);
  const seri = [];
  for (const g of [...gunMap.keys()].sort()) {
    if (g < t0 || g > son) continue;
    const z0 = gunMap.get(g); const L = (z0 && z0[test.alan]) || [];
    if (!L.length || !z0.fiyatlar) continue;
    const e = cikisGunu(gunMap, g); const z1 = e ? gunMap.get(e) : null;
    if (!z1 || !z1.fiyatlar) continue;
    const lr = medyan(L.map(x => netR(z0.fiyatlar[x.anahtar], z1.fiyatlar[x.anahtar], x.kanat)));
    const kr = medyan((z0.temizKume || []).map(([a, kanat]) => netR(z0.fiyatlar[a], z1.fiyatlar[a], kanat)));
    if (lr != null && kr != null) seri.push({ g, d: lr - kr });
  }
  if (seri.length < 2) return { gun: seri.length, ortalama: seri.length ? seri[0].d : null, aralik90: null, not: 'yetersiz gün' };
  const ort = (s) => s.reduce((a, x) => a + x.d, 0) / s.length;
  const r = mulberry(BOOT.tohum), L = seri.length, q = 1 / BOOT.blok;
  const dag = [];
  for (let b = 0; b < BOOT.n; b++) { const o = []; let i = Math.floor(r() * L); while (o.length < L) { o.push(seri[i]); i = r() < q ? Math.floor(r() * L) : (i + 1) % L; } dag.push(ort(o)); }
  dag.sort((a, b) => a - b);
  return { gun: L, ortalama: ort(seri), aralik90: [dag[Math.floor(0.05 * dag.length)], dag[Math.ceil(0.95 * dag.length) - 1]], not: 'duyarlılık (hükümsüz): günlük gözlemler örtüşür, n = gün değildir (§6)' };
}

/**
 * Yalnız SAYIM (hüküm gününden önce ve panel için): t0, hüküm günü, pencere tablosu — getiri/fark/yüzdelik YOK (A6).
 */
function hdl2(t, gun) {
  const t0 = t.t0 || null;
  if (!t0) return { durum: 'bekliyor', neden: 't0 henüz yok (evren eşikleri sabitlenmedi — ısınma)', hukumGunu: null, pencereler: [], gecerli: { izle: 0, puan: 0 } };
  const hukum = hukumGunu(t0);
  const pencereler = [];
  for (let k = 0; k < V.pencereSayi; k++) {
    const w = t.pencereler[k];
    const bas = gunEkle(t0, k * V.tutGun);
    if (!w) { pencereler.push({ k, planGun: bas, gun: null, durum: gun >= gunEkle(bas, V.tutGun) ? 'düştü (başlangıç yok)' : gun >= bas ? 'başlangıç bekleniyor' : 'gelecek' }); continue; }
    const u = Object.values(w.uyeler || {});
    const acik = u.filter(p => !p.sonuc).length;
    pencereler.push({ k, planGun: bas, gun: w.gun, boy: (w.liste || []).length, puanBoy: (w.puanListe || []).length, havuz: (w.havuz || []).length, kume: u.length, durum: acik ? 'izleniyor' : 'tamamlandı' });
  }
  const gecerli = { izle: pencereler.filter(p => p.gun && p.boy >= V.asgariBoy).length, puan: pencereler.filter(p => p.gun && p.puanBoy >= V.asgariBoy).length };
  return { durum: 'bekliyor', t0, hukumGunu: hukum, pencereler, gecerli, neden: gun >= hukum ? `hüküm günü (${hukum}) geldi; hüküm o günün gece koşusunda bir kez hesaplanıp kayda yazılır` : `hüküm ${hukum}; o güne kadar getiri farkı ve yüzdelik gösterilmez (A6)` };
}

/** HÜKÜM (İ24) — yalnız günlük adımda, hüküm günü bir kez. @param gunMap Map(gun → izle.json) bilgi kıyasları için */
function hdl2Hukum(t, gun, gunMap = new Map()) {
  const temel = hdl2(t, gun);
  const t0 = t.t0;
  const ozet = { hesaplandi: gun, t0, hukumGunu: temel.hukumGunu, pencereler: temel.pencereler, gecerli: temel.gecerli, izleSha: IZ.izleSha(), puanSha: IZ.puanSha() };
  const a4 = DT.bilinmiyorAylik(t, { bas: t0, son: gunEkle(t0, V.pencereSayi * V.tutGun - 1) });
  if (a4.sonucsuzRiski) return { durum: 'SONUCSUZ', ...ozet, neden: 'A4: P/F ve holder 30 g değerlendirmelerinin ≥ %30\'u 2 takvim ayı üst üste bilinmiyor', a4 };
  const sonuc = {};
  for (const test of TESTLER) sonuc[test.ad] = testOlc(t, test);
  const H = holm(TESTLER.map(x => (sonuc[x.ad].durum === 'olculdu' ? sonuc[x.ad].p : null)));
  TESTLER.forEach((test, i) => {
    const s = sonuc[test.ad];
    if (s.durum === 'SONUCSUZ') return;
    s.holm = H[i];
    s.durum = H[i] && s.M > s.Mevren && s.M > s.Mhavuz ? 'KABUL' : 'RED';
  });
  const terfiYok = sonuc.puan.durum === 'KABUL' && sonuc.izle.durum !== 'KABUL';
  const bilgi = {
    not: 'BİLGİ — hüküm vermez (§5 H-DL2 iii, H-DL2P ek bilgi, duyarlılık)',
    momentum: Object.fromEntries(TESTLER.map(x => [x.ad, momentumBilgi(t, x)])),
    btc: btcBilgi(t, TESTLER[0], gunMap),
    puanEksiIzle: sonuc.izle.M != null && sonuc.puan.M != null ? sonuc.puan.M - sonuc.izle.M : null,
    duyarlilik: t0 ? Object.fromEntries(TESTLER.map(x => [x.ad, duyarlilik(x, gunMap, t0)])) : null,
  };
  return { durum: 'hukum', ...ozet, a4, testler: sonuc, bilgi, ...(terfiYok ? { not: '782 tek başına geçti (781 geçmedi): puan gölgeden çıkmaz; terfi için yeni ön kayıt gerekir (A9)' } : {}) };
}

module.exports = { V, TESTLER, gunluk, gecis, pozisyon, pozIlerlet, getiri, takipKur, takipHazirla, izleGunleri, gecmisGunler, gunOlcum, oncekiIzle, onIzlemeKarne, hdl2, hdl2Hukum, testOlc, holm,
  rastgeleSepet, tabakaKur, tohum, takipOku, takipAnahtarlari, bosTakip, yollar, bosNeden, gunEkle, hukumKaydi, gunDosyalariOku, duyarlilik, hukumGunu };
