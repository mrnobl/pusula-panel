/**
 * DİKKAT F2 — günlük KAÇIN listesi + kendini denetleme (H-DL1 olay/kontrol/çöküş takibi). PLAN-DIKKAT-V1-ONKAYIT.md §5 H-DL1,
 * §6, EK-1 A1/A2/A4, düzeltme 2 ve 4, A8.
 * ═══════════════════════════════════════════════════════════════════════════
 * Günlük arşiv koşusu (lib/tarama/arsiv.js gunlukKos) anlık görüntüleri aldıktan sonra `gunluk()` çağrılır:
 *   1) her izlenen token için kural-v1 kapıları (lib/tarama/dikkat.js) → `arsiv/<gün>/dikkat.jsonl`
 *   2) açık pencerelerin (olay + kontrol) çöküş takibi bugünün verisiyle güncellenir
 *   3) KAÇIN'a YENİ giren token = olay; aynı gün, aynı kanat ve likidite diliminden 3 tohumlu kontrol → `arsiv/<gün>/dikkat-olay.jsonl`
 *   4) günün özeti (sayılar, payda, yeni girenler, çöküşler) → `arsiv/<gün>/dikkat-ozet.json`
 * Üç gün dosyası manifestin SHA zincirine girer (A8: birincil sonuç yalnız o gün üretilmiş listelerden). Türetilmiş durum
 * `dikkat/takip.json` (açık pencereler + sonuçlar) zincire girmez; gün dosyalarından `yenidenKur()` ile aynısı kurulur.
 *
 * t0 ÖNCESİ (ısınma): evren eşikleri henüz sabit değil (§1.4) → liste ve olaylar yine üretilir ama `isinma: true` taşır ve
 * H-DL1'e GİRMEZ (yalnız ön izleme karnesi). t0 = zincirdeki `evren/esik-v1.json` (N14; arsiv.esikOku).
 *
 * ÇÖKÜŞ (pencere t+1 … t+90; t günü sayılmaz — A1):
 *   (a) fiyat ≤ işaret günü fiyatı × 0,20   (b) CEX: Binance delist · DEX: tüm çiftlerin likiditesi < 1 000 $
 *   (c) fiyat ve hacim kayboldu ve 14 gün boyunca geri gelmedi (çöküş günü = kaybolma günü; düzeltme 2)
 * HÜKÜM: kapsam t0 … t0+182 g olayları; hüküm günü t0 + 286 g. Ara raporda HÜKÜM YOK. Karne (kapı başına isabet) yalnız bilgi.
 *
 * Liste bota/portföye/emre bağlanmaz. lib/live, lib/risk'e dokunmaz.
 *
 * ÖLÇÜM NETLEŞTİRMELERİ (2026-10-15, t0 öncesi; hiçbir çöküş/getiri hesaplanmadan, bağımsız denetimden sonra yazıldı — kural değişikliği
 * değil, ön kaydın açık bıraktığı uygulama ayrıntıları; sonradan değiştirilirse ayrı bir kayıtla):
 *   N1 Liste = değerlendirme kümesi (t0 sonrası evren; öncesi EK-2 b ısınma kümesi). Evrenden çıkıp yalnız izlemesi süren ya da
 *      hariç sınıftaki token'ın kapıları hesaplanır ama KAÇIN sayılmaz (kacinHam).
 *   N2 "t−1'de KAÇIN değil": token'ın SON BİLİNEN durumu (yetersiz veri günü atlanır, en çok 7 kayıt günü geri). Hiç bilinmiyorsa ilk
 *      bilinen gün giriştir; önceki kayıt günü hiç yoksa olay yok.
 *   N3 Sözleşme eşlemesi o gün kurulamayan token (arşivde güvenlik kaynağı hata/kota/belirsiz, adres yok) → zincire bağlı kapılar
 *      bilinmiyor + yetersiz veri (EK-2 c).
 *   N4 Meşguliyet (§6): çöküşle erken kapanan pencere de başlangıçtan 90 gün geçene kadar token'ı tutar; t0 sonrası ısınma
 *      pencereleri meşguliyet sayılmaz.
 *   N5 Çöküş (a) yalnız işaret günüyle AYNI fiyat kaynağıyla; işaret günü fiyatı yoksa (a) ölçülmez, (b)(c) sürer.
 *   N6 K7 "son 7 kayıt günü" = bugün + önceki 6 manifest günü (takvim değil); token o gün yoksa bilinmiyor.
 *   N7 A4 paydası değerlendirme kümesi; hükümde kapsam (t0 … t0+181) ayları, kayıt olmayan takvim günü oran 1.
 *   N8 Hüküm gününde kayıt kesintisi yüzünden kapanmamış pencere "ölçülemedi": oranlardan düşer, sayısı raporlanır.
 *   N9 Kontrol sıralama tohumu SHA-256(gün|kural-v1|780|token) — "sürüm" = kural sürümü; evren sürümü (evren-v1) satırda ayrı.
 *   N10 K11'in GeckoTerminal yedeği yok: arşivin GeckoTerminal ucu likidite vermiyor (yalnız holder) → DexScreener tek kaynak.
 *   N11 DEX→CEX birleşmesinde (durum.izleme.birlesti) pencere birleşen CEX kaydının ölçümüyle sürer.
 * EK NETLEŞTİRMELER (2026-10-15, 64.3 bağımsız denetiminden sonra; t0 öncesi, hiçbir çöküş/getiri hesaplanmadan):
 *   N12 Çöküş (b) DEX "likidite < 1 000 $" yalnız DexScreener cevap verdiyse (ok). DexScreener "çift yok" (bos) tek günde çöküş
 *       sayılmaz: pencere içinde başlarsa (c) gibi 14 gün teyit beklenir; araya çift bulunan gün girerse sayılmaz; teyit edilirse
 *       çöküş günü = ilk bos günü, kod 'b'. Teyit beklerken pencere temiz kapanmaz (en geç başlangıç + 104 g).
 *   N13 H-DL1 hükmü t0 + 286 günündeki (o gün kayıt yoksa sonraki ilk) dikkat koşusunda BİR KEZ hesaplanır ve
 *       `arsiv/<gün>/dikkat-hukum.json` olarak manifest zincirine yazılır; sonradan yeniden hesaplanmaz, panel bu dosyayı okur.
 *   N14 Evren eşikleri (§1.4) elle commit'e bağlı değildir: günlük koşu, manifestte 30. kayıt günü tamamlandıktan sonraki ilk koşuda
 *       ilk 30 kayıt gününden (boşluklu da olsa) `evren.esikHesapla` ile eşikleri hesaplar ve `evren/esik-v1.json`'u o günün
 *       dosyası olarak zincire BİR KEZ yazar (resmî ve deneme kökleri ayrı; deneme resmî sayaca girmez). t0 = 30. kayıt gününden
 *       sonraki 2. takvim günü (A5). A5'in "kural kodu commit günü + 1" şartı etkisiz: KAÇIN/İZLE kural kodu 2026-10-15'te commit'lendi,
 *       resmî kayıt 2026-10-10'da başladığı için 30. kayıt günü + 2 her durumda daha geç. `evren.ESIKLER_V1` null kalır; doluysa ve
 *       dosyayla çelişirse koşu durur (sessiz seçim yok). Dosyanın SHA'sı manifestle tutmazsa koşu durur.
 *   N15 Takip durumu gün dosyalarından yeniden kurulurken DEX→CEX birleşme eşlemesi evren dosyalarının `karar: 'birlesti'`
 *       satırlarından (anahtar → hedef) birikerek kurulur; canlı adımın `durum.izleme.birlesti` eşlemesiyle aynı sonucu verir.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const D = require('./dikkat');
const IZ = require('./izle');   // 64.3: İZLE/puan ek ölçüm alanları (m'ye EKLENİR; kapılar okumaz — KAÇIN çıktısı aynı)
const { atomikYaz, jsonOku, sha256, gunStr } = require('./ortak');

const H = Object.freeze({
  pencereGun: 90, kayipGun: 14, kontrolSayi: 3, dilim: 5, cokusOran: 0.20, dexLikiditeAlt: 1000,
  kapsamGun: 182, hukumGun: 286, araRaporGun: 13 * 7 + 90, asgariOlay: 30, asgariCokus: 5,
  bootstrap: Object.freeze({ blokHafta: 4, n: 2000, tohum: 99, guven: 0.90 }),
  erkenGun: 30,
});
const GUN = 864e5;
const gunEkle = (g, n) => gunStr(Date.parse(`${g}T00:00:00Z`) + n * GUN);
const fark = D.gunFark;

// ── Dosyalar ─────────────────────────────────────────────────────────────
function yollar(kok) {
  return { takip: path.join(kok, 'dikkat', 'takip.json'), gunDiz: (g) => path.join(kok, 'arsiv', g) };
}
function bosTakip() { return { surum: 1, kural: D.KURAL_V1.surum, sonGun: null, olaySayac: 0, pencereler: {}, olaylar: [], gunler: [] }; }
function takipOku(kok) { return jsonOku(yollar(kok).takip, null) || bosTakip(); }

/** Bir pencerede olan (olay ya da kontrol, kapanmamış) token anahtarları — arşiv bu token'ları evrenden çıksalar da izler (§1.3). */
function takipAnahtarlari(kok, gun) {
  const t = takipOku(kok);
  const out = new Set();
  for (const p of Object.values(t.pencereler)) if (!p.kapandi && (!gun || gun <= p.sonIzleme)) out.add(p.anahtar);
  return out;
}

// ── Evren / dilim ────────────────────────────────────────────────────────
/**
 * Bugünün değerlendirme kümesi: t0 sonrası evren (karar 'girdi' + sabit eşikler), öncesi ısınma kümesi (taban/ısınma).
 * Likidite dilimi = kanat içinde beşte birlik (DEX: likidite, CEX: 7 g medyan hacim).
 */
function kume(evrenSatirlari, esikler, isinma) {
  const uye = new Map();
  for (const r of evrenSatirlari || []) {
    if (!r || !r.anahtar || !r.olcum) continue;
    const o = r.olcum;
    let icinde;
    if (!isinma && esikler) {
      icinde = r.karar === 'girdi' && Number.isFinite(o.hacim7Medyan) && (r.kanat === 'cex'
        ? o.hacim7Medyan >= esikler.V_cex
        : o.hacim7Medyan >= esikler.V_dex && Number.isFinite(o.likidite) && o.likidite >= esikler.L_dex);
    } else icinde = !!((r.karar === 'girdi' && r.taban) || r.isinma);   // EK-2 b ısınma kümesi (hariç sınıf / yaş / ağ dışı GİRMEZ)
    if (icinde) uye.set(r.anahtar, { kanat: r.kanat, olcu: r.kanat === 'cex' ? o.hacim7Medyan : o.likidite });
  }
  for (const kanat of ['cex', 'dex']) {
    const l = [...uye.entries()].filter(([, v]) => v.kanat === kanat && Number.isFinite(v.olcu)).sort((a, b) => a[1].olcu - b[1].olcu || a[0].localeCompare(b[0]));
    l.forEach(([, v], i) => { v.dilim = Math.min(H.dilim - 1, Math.floor((i * H.dilim) / l.length)); });
  }
  return uye;
}

// ── Pencere takibi ───────────────────────────────────────────────────────
/** Açık pencereyi bugünün ölçümüyle ilerlet. m = dikkat.olcum(row) | null (token bugün kayıtta yok). */
function pencereIlerlet(p, gun, m, kanat) {
  if (p.kapandi || gun <= p.bas) return null;
  const g = fark(p.bas, gun);
  if (!m) { p.eksikGun = (p.eksikGun || 0) + (g <= H.pencereGun ? 1 : 0); return kapat(p, gun); }
  if (g <= H.pencereGun) {
    // (a) yalnız işaret günüyle AYNI fiyat kaynağı karşılaştırılır (CoinGecko ↔ DexScreener karışmaz — denetim 7f)
    if (Number.isFinite(m.fiyat) && Number.isFinite(p.fiyat0) && p.fiyat0 > 0 && (!p.fiyatKaynak || m.fiyatKaynak === p.fiyatKaynak)) {
      const oran = m.fiyat / p.fiyat0;
      if (p.enDusuk == null || oran < p.enDusuk) p.enDusuk = oran;
      if (oran <= H.cokusOran) return cok(p, gun, 'a', `fiyat işaret gününün %${(oran * 100).toFixed(1)}'i (≤ %${H.cokusOran * 100})`);
    }
    if (kanat === 'cex' && m.delist === true) return cok(p, gun, 'b', 'Binance listesinde TRADING USDT paritesi yok (delist)');
    if (kanat === 'dex' && m.likiditeD === 'ok' && Number.isFinite(m.likidite) && m.likidite < H.dexLikiditeAlt) return cok(p, gun, 'b', `DEX likiditesi ${Math.round(m.likidite)} (< ${H.dexLikiditeAlt})`);
  }
  // N12: DexScreener "çift yok" 14 gün teyit
  if (kanat === 'dex') { if (m.likiditeD === 'bos') { if (!p.bosBas && g <= H.pencereGun) p.bosBas = gun; } else if (m.likiditeD === 'ok') p.bosBas = null; }
  if (p.bosBas && fark(p.bosBas, gun) >= H.kayipGun) return cok(p, p.bosBas, 'b', `DexScreener'da çift yok ${p.bosBas} tarihinden beri (≥ ${H.kayipGun} g)`);
  // (c) kaybolma: kesinti 14 gün içinde geri dönerse sayılmaz
  if (m.fiyatYok === true) { if (!p.kayipBas && g <= H.pencereGun) p.kayipBas = gun; }
  else if (m.fiyatYok === false) p.kayipBas = null;
  if (p.kayipBas && fark(p.kayipBas, gun) >= H.kayipGun) return cok(p, p.kayipBas, 'c', `fiyat ve hacim ${p.kayipBas} tarihinden beri yok (≥ ${H.kayipGun} g)`);
  return kapat(p, gun);
}
function cok(p, gun, kod, metin) { p.kapandi = gun; p.sonuc = 'coktu'; p.cokusGun = gun; p.cokusKod = kod; p.cokusMetin = metin; p.cokusSure = fark(p.bas, gun); return { tur: 'coktu', p }; }
function kapat(p, gun) {
  if (fark(p.bas, gun) >= H.pencereGun && !p.kayipBas && !p.bosBas) { p.kapandi = gun; p.sonuc = 'temiz'; return { tur: 'temiz', p }; }
  if ((p.kayipBas || p.bosBas) && fark(p.bas, gun) >= H.pencereGun + H.kayipGun) { p.kapandi = gun; p.sonuc = 'temiz'; return { tur: 'temiz', p }; }
  return null;
}

/** Tohumlu sıralama anahtarı: SHA-256(gün + sürüm + deneme no + token) — aynı gün aynı kontrol seçimi. */
const tohumAnahtar = (gun, anahtar) => sha256(`${gun}|${D.KURAL_V1.surum}|${D.KURAL_V1.deneme}|${anahtar}`);

// ── Günlük adım ──────────────────────────────────────────────────────────
/**
 * @param o { kok, gun, anlik: [satır], evren: [evren satırı], oncekiGunler: [{ gun, m: Map(anahtar → olcum) }] (yeniden eskiye, ≤ 7),
 *            oncekiKacin: Set(anahtar) | null (önceki kayıt gününün KAÇIN kümesi; null = önceki gün yok), esikler: esik-v1.json içeriği | null, takip? }
 * @returns { satirlar, olaySatirlari, ozet, takip }  — DOSYA YAZMAZ (çağıran yazar)
 */
function gunluk(o) {
  const { gun } = o;
  const t = o.takip || bosTakip();
  const esikler = o.esikler || null;
  const t0 = esikler && esikler.t0 ? esikler.t0 : null;
  const isinma = !t0 || gun < t0;
  const oncekiGun = o.oncekiGunler && o.oncekiGunler[0] ? o.oncekiGunler[0].gun : null;
  const sha = D.kurallarSha();

  // 1) kapılar — her izlenen token için hesaplanır (ertesi günün değişim kapıları ölçümü ister), ama LİSTE yalnız değerlendirme
  // kümesidir (t0 sonrası evren, öncesi ısınma kümesi): evrenden çıkıp yalnız izlemesi süren ya da hariç sınıftaki token
  // `evrende: false` taşır, KAÇIN sayılmaz (kacinHam kapıların ham sonucudur).
  const k = kume(o.evren, esikler, isinma);
  const satirlar = [];
  const sonuc = new Map();
  for (const row of o.anlik || []) {
    // Önceki KAYIT günleri (token o gün yoksa m = null; K7 "son 7 kayıt günü" bunu bilinmiyor sayar)
    const once = (o.oncekiGunler || []).map(x => ({ gun: x.gun, m: x.m.get(row.anahtar) || null }));
    const d = D.degerlendir(row, gun, once, oncekiGun);
    sonuc.set(row.anahtar, { row, d });
    const kapilar = {};
    for (const [kd, v] of Object.entries(d.kapilar)) kapilar[kd] = v.s === 'dogru' ? { s: v.s, metin: v.metin } : v.s === 'yanlis' ? { s: v.s } : { s: v.s, neden: v.neden };
    const evrende = k.has(row.anahtar);
    satirlar.push({ gun, surum: D.KURAL_V1.surum, anahtar: row.anahtar, sembol: row.sembol || null, kanat: row.kanat, ag: row.ag || null, adres: row.adres || null,
      evrende, kacin: d.kacin && evrende, kacinHam: d.kacin, yetersiz: d.yetersiz, dogru: d.dogru, yeni: false, bilgi: d.bilgi, kapilar, m: { ...d.m, ...IZ.ozellik(row) } });
  }
  const kacinBugun = new Set(satirlar.filter(s => s.kacin).map(s => s.anahtar));
  // "Yeni giriş" (t−1'de KAÇIN değil, t'de KAÇIN): önceki günlerin SON BİLİNEN durumuna bakılır. Önceki gün token yetersiz veri
  // (KAÇIN olup olmadığı bilinmiyor) ise daha eski güne geçilir; bilinmeyen durumdan "girdi" üretilmez. Önceki 7 kayıt gününde
  // hiç bilinmiyorsa (yeni keşfedildi ya da hep yetersizdi) ilk bilinen gün giriştir. Önceki kayıt günü hiç yoksa olay yok (taban).
  const oncekiDurum = o.oncekiDurum || (o.oncekiKacin ? [{ gun: oncekiGun, kacin: o.oncekiKacin, bilinen: null }] : []);
  const yeniMi = (a) => {
    if (!oncekiDurum.length) return false;
    for (const d of oncekiDurum) {
      if (d.kacin && d.kacin.has(a)) return false;
      if (!d.bilinen || d.bilinen.has(a)) return true;
    }
    return true;
  };
  const yeniGiren = [...kacinBugun].filter(yeniMi).sort();
  for (const s of satirlar) if (yeniGiren.includes(s.anahtar)) s.yeni = true;

  // 2) açık pencereler
  const kapanan = [];
  const birlesme = o.birlesme || {};   // DEX anahtarı Binance'e çıkınca tek CEX kaydına birleşir (arsiv durum.izleme.birlesti)
  for (const p of Object.values(t.pencereler)) {
    if (p.kapandi) continue;
    const s = sonuc.get(p.anahtar) || (birlesme[p.anahtar] ? sonuc.get(birlesme[p.anahtar]) : null);
    const r = pencereIlerlet(p, gun, s ? s.d.m : null, p.kanat);
    if (r) kapanan.push({ olayNo: p.olayNo, tur: p.tur, anahtar: p.anahtar, sembol: p.sembol, sonuc: r.tur, gun: p.kapandi, kod: p.cokusKod || null, metin: p.cokusMetin || null, isinma: !!p.isinma });
  }
  // Kapanmış pencereler pencere haritasından olay listesine taşınmaz — anahtar `${olayNo}:${tur}:${anahtar}`; meşguliyet = kapanmamış
  const mesgul = new Map();   // anahtar → { olay: bool, kontrol: bool }
  // §6 "son 90 g'de olay/kontrol penceresinde bulunmayan": çöküşle erken kapanan pencere de 90 gün dolana kadar meşgul
  // (denetim 6). t0 sonrası ısınma pencereleri değerlendirme kümesini daraltmaz (denetim 7h).
  for (const p of Object.values(t.pencereler)) {
    if (!isinma && p.isinma) continue;
    if (p.kapandi && fark(p.bas, gun) > H.pencereGun) continue;
    for (const a of [p.anahtar, birlesme[p.anahtar]].filter(Boolean)) { const x = mesgul.get(a) || {}; x[p.tur] = true; mesgul.set(a, x); }
  }

  // 3) yeni olaylar + kontroller (önceki kayıt günü yoksa "yeni giriş" tanımlanamaz → olay yok; ilk gün taban)
  const olaySatirlari = [];
  const yetersiz = new Set(satirlar.filter(s => s.yetersiz).map(s => s.anahtar));
  const havuz = satirlar.filter(s => !s.kacin && !s.yetersiz && k.has(s.anahtar) && Number.isFinite(k.get(s.anahtar).dilim))
    .map(s => ({ s, u: k.get(s.anahtar), h: tohumAnahtar(gun, s.anahtar) })).sort((a, b) => a.h.localeCompare(b.h));
  const secildi = new Set();
  for (const a of yeniGiren) {
    if (!k.has(a)) continue;                                   // olay yalnız değerlendirme kümesindeki token için
    const m0 = mesgul.get(a) || {};
    if (m0.olay) continue;                                      // §6: önceki olay penceresi bitmeden yeni olay yok
    const s = sonuc.get(a); const u = k.get(a);
    t.olaySayac++;
    const olayNo = t.olaySayac;
    const ac = (tur, satir, uye, kontrolSira) => {
      const id = `${olayNo}:${tur}:${satir.anahtar}`;
      const p = { id, olayNo, tur, anahtar: satir.anahtar, sembol: satir.sembol, kanat: satir.kanat, bas: gun, sonIzleme: gunEkle(gun, H.pencereGun + H.kayipGun),
        fiyat0: satir.m.fiyat, fiyatKaynak: satir.m.fiyatKaynak, dilim: uye ? uye.dilim : null, kapilar: tur === 'olay' ? satir.dogru : [], isinma,
        ...(kontrolSira != null ? { kontrolSira } : {}), kapandi: null, sonuc: null };
      t.pencereler[id] = p;
      const x = mesgul.get(satir.anahtar) || {}; x[tur] = true; mesgul.set(satir.anahtar, x);
      olaySatirlari.push({ gun, surum: D.KURAL_V1.surum, kurallarSha: sha, olayNo, tur, anahtar: satir.anahtar, sembol: satir.sembol, kanat: satir.kanat, dilim: p.dilim,
        fiyat0: p.fiyat0, fiyatKaynak: p.fiyatKaynak, kapilar: p.kapilar, isinma, ...(kontrolSira != null ? { kontrolSira } : {}) });
    };
    void s; ac('olay', satirlar.find(x => x.anahtar === a), u);
    // Kontrol: aynı kanat + dilim, bugün KAÇIN değil, yetersiz değil, hiçbir açık pencerede değil, bugün başka olaya seçilmemiş
    let n = 0;
    for (const c of havuz) {
      if (n >= H.kontrolSayi) break;
      if (c.u.kanat !== u.kanat || c.u.dilim !== u.dilim || secildi.has(c.s.anahtar) || yetersiz.has(c.s.anahtar)) continue;
      const mc = mesgul.get(c.s.anahtar);
      if (mc && (mc.olay || mc.kontrol)) continue;
      secildi.add(c.s.anahtar); ac('kontrol', c.s, c.u, n); n++;
    }
  }

  // 4) özet
  const evr = satirlar.filter(s => s.evrende);
  const pay = D.payda(evr);
  const ozet = { gun, surum: D.KURAL_V1.surum, kurallarSha: sha, isinma, t0, oncekiGun,
    token: evr.length, izlenen: satirlar.length, kacin: kacinBugun.size, yetersiz: evr.filter(s => s.yetersiz).length, yeniGiren: yeniGiren.map(a => { const s = satirlar.find(x => x.anahtar === a); return { anahtar: a, sembol: s.sembol, kanat: s.kanat, kapilar: s.dogru }; }),
    olay: olaySatirlari.filter(x => x.tur === 'olay').length, kontrol: olaySatirlari.filter(x => x.tur === 'kontrol').length,
    kapanan, payda: { toplam: pay.toplam, bilinmiyor: pay.bilinmiyor, oran: pay.oran, kapi: pay.kapi },
    kapiDogru: Object.fromEntries(D.KURAL_V1.birincil.concat(D.KURAL_V1.bilgi).map(kd => [kd, evr.filter(s => s.kapilar[kd] && s.kapilar[kd].s === 'dogru').length])) };
  t.sonGun = gun; t.t0 = t0;
  t.gunler = [...(t.gunler || []).filter(x => x.gun !== gun), { gun, kacin: ozet.kacin, yetersiz: ozet.yetersiz, token: ozet.token, oran: pay.oran, olay: ozet.olay, isinma }].slice(-400);
  // N13: hüküm günü (ya da sonraki ilk dikkat günü), zincirde henüz yoksa BİR KEZ
  const hukum = t0 && gun >= gunEkle(t0, H.hukumGun) && !o.hukumVar ? { ...hdl1(t, gun), hesaplandi: gun, kurallarSha: sha } : null;
  return { satirlar, olaySatirlari, ozet, takip: t, hukum };
}

// ── Önceki günler ────────────────────────────────────────────────────────
/**
 * Manifestteki son N gün kaydından ölçümler: gün dosyası `dikkat.jsonl` varsa ondan (m), yoksa `anlik.jsonl`'dan yeniden kurulur
 * (F2 öncesi resmî günler). @param dosyaOku (kok, göreli) → Buffer|null (arsiv.dosyaOku; .gz açar)
 */
function oncekiGunler(kok, manifestSatirlari, bugun, dosyaOku, n = 7, esikler = null) {
  const satirlar = (b) => (b ? b.toString('utf8').split('\n').filter(s => s.trim()).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean) : []);
  const gunler = manifestSatirlari.filter(k => k.tur === 'gun' && k.gun < bugun).map(k => k.gun).slice(-n);   // eskiden yeniye
  const t0 = esikler && esikler.t0 ? esikler.t0 : null;
  const islenen = [];   // yeniden eskiye birikir (hesapta "önceki günler" bunlar)
  for (const g of gunler) {
    const m = new Map(); const kacin = new Set(); const bilinen = new Set();
    const dk = satirlar(dosyaOku(kok, `arsiv/${g}/dikkat.jsonl`));
    let kaynak;
    if (dk.length) {
      kaynak = 'dikkat';
      for (const r of dk) {
        m.set(r.anahtar, r.m);
        const evrende = r.evrende !== false;   // 64.1 öncesi yazılmış satırda alan yok: kümedeydi sayılır
        if (r.kacin) kacin.add(r.anahtar);
        if (evrende && !r.yetersiz) bilinen.add(r.anahtar);
      }
    } else {
      // F2 öncesi gün: o günün kendi ham verisi + evren satırlarıyla ve O GÜNE KADARKİ günlerle hesaplanır (o güne dosya YAZILMAZ)
      kaynak = 'anlik';
      const k = kume(satirlar(dosyaOku(kok, `evren/${g}.jsonl`)), esikler, !t0 || g < t0);
      const once0 = islenen.slice(0, 7);
      for (const row of satirlar(dosyaOku(kok, `arsiv/${g}/anlik.jsonl`))) {
        const once = once0.map(x => ({ gun: x.gun, m: x.m.get(row.anahtar) || null })).filter(x => x.m);
        const d = D.degerlendir(row, g, once, once0[0] ? once0[0].gun : null);
        m.set(row.anahtar, { ...d.m, ...IZ.ozellik(row) });
        const evrende = k.has(row.anahtar);
        if (d.kacin && evrende) kacin.add(row.anahtar);
        if (evrende && !d.yetersiz) bilinen.add(row.anahtar);
      }
    }
    islenen.unshift({ gun: g, m, kacin, bilinen, kaynak });
  }
  return { gunler: islenen.map(x => ({ gun: x.gun, m: x.m, kaynak: x.kaynak })), durum: islenen.map(x => ({ gun: x.gun, kacin: x.kacin, bilinen: x.bilinen })) };
}

// ── Takip durumunun KAYITLI gün dosyalarından kurulması (denetim 5) ────────
const dikkatGunleri = (manifestSatirlari, once) => manifestSatirlari
  .filter(k => k.tur === 'gun' && (!once || k.gun < once) && (k.dosyalar || []).some(d => /\/dikkat\.jsonl$/.test(d.yol))).map(k => k.gun);

/**
 * `dikkat/takip.json` türetilmiştir: her dikkat günü için o günün `dikkat.jsonl` ölçümleriyle açık pencereler ilerletilir, sonra o günün
 * `dikkat-olay.jsonl`'ındaki olay/kontrol pencereleri açılır (gunluk ile aynı sıra). Kural YENİDEN HESAPLANMAZ — yalnız o gün canlı
 * yazılmış (SHA zincirindeki) dosyalar okunur (A8). @returns takip
 */
/** N15: bir günün evren dosyasındaki DEX→CEX birleşmeleri { anahtar: hedef } (yalnız 'birlesti' satırları ayrıştırılır). */
function birlesmeOku(kok, g, dosyaOku) {
  const b = dosyaOku(kok, `evren/${g}.jsonl`);
  const out = {};
  if (!b) return out;
  for (const s of b.toString('utf8').split('\n')) {
    if (!s.includes('"birlesti"')) continue;
    try { const r = JSON.parse(s); if (r && r.karar === 'birlesti' && r.anahtar && r.hedef) out[r.anahtar] = r.hedef; } catch { /* bozuk satır */ }
  }
  return out;
}

function takipKur(kok, manifestSatirlari, bugun, dosyaOku) {
  const satir = (b) => (b ? b.toString('utf8').split('\n').filter(s => s.trim()).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean) : []);
  const t = bosTakip();
  const birlesme = {};
  const dikkatSet = new Set(dikkatGunleri(manifestSatirlari, bugun));
  for (const k of manifestSatirlari.filter(x => x.tur === 'gun' && (!bugun || x.gun < bugun))) {
    const g = k.gun;
    Object.assign(birlesme, birlesmeOku(kok, g, dosyaOku));
    if (!dikkatSet.has(g)) continue;
    const m = new Map(satir(dosyaOku(kok, `arsiv/${g}/dikkat.jsonl`)).map(r => [r.anahtar, r.m]));
    for (const p of Object.values(t.pencereler)) if (!p.kapandi) pencereIlerlet(p, g, m.get(p.anahtar) || (birlesme[p.anahtar] ? m.get(birlesme[p.anahtar]) : null) || null, p.kanat);
    for (const r of satir(dosyaOku(kok, `arsiv/${g}/dikkat-olay.jsonl`))) {
      const id = `${r.olayNo}:${r.tur}:${r.anahtar}`;
      t.pencereler[id] = { id, olayNo: r.olayNo, tur: r.tur, anahtar: r.anahtar, sembol: r.sembol, kanat: r.kanat, bas: g, sonIzleme: gunEkle(g, H.pencereGun + H.kayipGun),
        fiyat0: r.fiyat0, fiyatKaynak: r.fiyatKaynak, dilim: r.dilim, kapilar: r.kapilar || [], isinma: !!r.isinma, ...(r.kontrolSira != null ? { kontrolSira: r.kontrolSira } : {}), kapandi: null, sonuc: null };
      if (r.olayNo > t.olaySayac) t.olaySayac = r.olayNo;
    }
    let oz = null; try { const b = dosyaOku(kok, `arsiv/${g}/dikkat-ozet.json`); oz = b ? JSON.parse(b.toString('utf8')) : null; } catch { oz = null; }
    if (oz) { t.gunler.push({ gun: g, kacin: oz.kacin, yetersiz: oz.yetersiz, token: oz.token, oran: oz.payda ? oz.payda.oran : null, olay: oz.olay, isinma: oz.isinma }); t.t0 = oz.t0 || null; }
    t.sonGun = g;
  }
  t.gunler = t.gunler.slice(-400);
  t.kuruldu = { zaman: new Date().toISOString(), kaynak: 'gün dosyaları' };
  return t;
}

/**
 * Günlük adımın kullanacağı takip: diskteki takip.json son dikkat gününe (bugünden önceki) ulaşıyorsa o, yoksa (yazılamamış, süreç
 * arada düşmüş, deneme --zorla ile gün silinmiş) gün dosyalarından yeniden kurulur. @returns { takip, kuruldu: bool }
 */
function takipHazirla(kok, manifestSatirlari, bugun, dosyaOku) {
  const g = dikkatGunleri(manifestSatirlari, bugun);
  const son = g[g.length - 1] || null;
  const t = takipOku(kok);
  if ((t.sonGun || null) === son) return { takip: t, kuruldu: false };
  return { takip: takipKur(kok, manifestSatirlari, bugun, dosyaOku), kuruldu: true };
}

// ── Karne (kendini denetleme; BİLGİ — hüküm değil) ───────────────────────
/**
 * Kapanan pencerelerden: olay ve kontrol çöküş oranları, fark, yanlış alarm, kapı başına tablo, 30 g erken görünüm.
 * @param t takip, @param o { isinma: true|false|'hepsi' }
 */
function karne(t, o = {}) {
  const hepsi = Object.values(t.pencereler || {});
  const sec = hepsi.filter(p => (o.isinma === 'hepsi' ? true : !!p.isinma === !!o.isinma));
  const say = (l) => { const k = l.filter(p => p.kapandi); const c = k.filter(p => p.sonuc === 'coktu'); const e = l.filter(p => p.sonuc === 'coktu' && p.cokusSure <= H.erkenGun);
    return { n: l.length, kapanan: k.length, acik: l.length - k.length, coktu: c.length, oran: k.length ? c.length / k.length : null, erken30: e.length }; };
  const olay = sec.filter(p => p.tur === 'olay'), kontrol = sec.filter(p => p.tur === 'kontrol');
  const O = say(olay), K = say(kontrol);
  const kapi = {};
  for (const kd of D.KURAL_V1.birincil) {
    const l = olay.filter(p => (p.kapilar || []).includes(kd));
    const yalniz = l.filter(p => p.kapilar.length === 1);
    kapi[kd] = { ad: D.KAPI_AD[kd], ...say(l), yalniz: say(yalniz), yanlisAlarm: say(l).kapanan ? (say(l).kapanan - say(l).coktu) / say(l).kapanan : null };
  }
  const kod = { a: 0, b: 0, c: 0 };
  for (const p of olay) if (p.sonuc === 'coktu') kod[p.cokusKod] = (kod[p.cokusKod] || 0) + 1;
  return { olay: O, kontrol: K, fark: O.oran != null && K.oran != null ? O.oran - K.oran : null, yanlisAlarm: O.kapanan ? (O.kapanan - O.coktu) / O.kapanan : null,
    kapi, cokusNedeni: kod, not: 'BİLGİ — ara görünüm, hüküm değil (PLAN-DIKKAT-V1-ONKAYIT §8). Kapı başına tablo çoklu karşılaştırmadır.' };
}

// ── H-DL1 hüküm (A2) — yalnız hüküm gününde gösterilir ───────────────────
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const haftaBasi = (g) => { const t = Date.parse(`${g}T00:00:00Z`); const gun = (new Date(t).getUTCDay() + 6) % 7; return gunStr(t - gun * GUN); };

/**
 * @returns { durum: 'bekliyor'|'SONUCSUZ'|'KABUL'|'RED', ... } — gun < hüküm günü ise yalnız sayım (fark gösterilmez).
 * Olay haftası w: d_w = (olayların çöküş oranı − aynı olayların kontrollerinin çöküş oranı); istatistik Σ n_w d_w / Σ n_w;
 * durağan blok bootstrap (ortalama blok 4 hafta, N 2000, tohum 99), %90 aralık. Seri yalnız olaylı haftalardan.
 */
function hdl1(t, gun) {
  const t0 = (t.t0 || null);
  if (!t0) return { durum: 'bekliyor', neden: 't0 henüz yok (evren eşikleri sabitlenmedi — ısınma)' };
  const kapsamSon = gunEkle(t0, H.kapsamGun), hukum = gunEkle(t0, H.hukumGun), ara = gunEkle(t0, H.araRaporGun);
  const pen = Object.values(t.pencereler || {}).filter(p => !p.isinma && p.bas >= t0 && p.bas < kapsamSon);
  const olay = pen.filter(p => p.tur === 'olay');
  const temel = { t0, kapsamSon, araRapor: ara, hukumGunu: hukum, olay: olay.length, kontrol: pen.length - olay.length, kapanan: pen.filter(p => p.kapandi).length };
  if (gun < hukum) return { durum: 'bekliyor', ...temel, neden: `hüküm ${hukum}; ara raporda hüküm yok` };
  // A4: kapsam dönemi (t0 … kapsam sonu) aylarında bilinmiyor oranı; kayıt boşluğu günleri oran 1 (denetim 3) → hükmün ÖNÜNDE
  const a4 = bilinmiyorAylik(t, { bas: t0, son: gunEkle(kapsamSon, -1) });
  if (a4.sonucsuzRiski) return { durum: 'SONUCSUZ', ...temel, neden: 'A4: birincil kapı değerlendirmelerinin ≥ %30\'u 2 takvim ayı üst üste bilinmiyor (kayıt boşlukları dahil)', a4 };
  // Kayıt kesintisi yüzünden hüküm gününde kapanmamış pencere: sonucu ÖLÇÜLEMEDİ — orandan düşer, sayısı raporlanır (denetim 7b)
  const eksik = pen.filter(p => !p.kapandi);
  const kapali = pen.filter(p => p.kapandi);
  const olayK = kapali.filter(p => p.tur === 'olay');
  const cokus = kapali.filter(p => p.sonuc === 'coktu').length;
  if (olayK.length < H.asgariOlay || cokus < H.asgariCokus) return { durum: 'SONUCSUZ', ...temel, cokus, eksik: eksik.length, neden: `asgari örneklem yok (sonucu ölçülen olay ${olayK.length} < ${H.asgariOlay} ya da çöküş ${cokus} < ${H.asgariCokus})` };
  const hafta = new Map();
  for (const p of olayK) {
    const w = haftaBasi(p.bas);
    const ks = kapali.filter(x => x.tur === 'kontrol' && x.olayNo === p.olayNo);
    const x = hafta.get(w) || { n: 0, oc: 0, kn: 0, kc: 0 };
    x.n++; if (p.sonuc === 'coktu') x.oc++;
    x.kn += ks.length; x.kc += ks.filter(k => k.sonuc === 'coktu').length;
    hafta.set(w, x);
  }
  const seri = [...hafta.entries()].sort((a, b) => a[0].localeCompare(b[0])).filter(([, x]) => x.kn > 0).map(([w, x]) => ({ w, n: x.n, d: x.oc / x.n - x.kc / x.kn }));
  if (!seri.length) return { durum: 'SONUCSUZ', ...temel, cokus, eksik: eksik.length, neden: 'kontrolü olan olay haftası yok (kıyas kurulamadı)' };
  const ist = (s) => s.reduce((a, x) => a + x.n * x.d, 0) / s.reduce((a, x) => a + x.n, 0);
  const deger = ist(seri);
  const r = mulberry(H.bootstrap.tohum), L = seri.length, p = 1 / H.bootstrap.blokHafta;
  const dag = [];
  for (let b = 0; b < H.bootstrap.n; b++) {
    const ornek = []; let i = Math.floor(r() * L);
    while (ornek.length < L) { ornek.push(seri[i]); i = r() < p ? Math.floor(r() * L) : (i + 1) % L; }
    dag.push(ist(ornek));
  }
  dag.sort((a, b) => a - b);
  const alt = dag[Math.floor(((1 - H.bootstrap.guven) / 2) * dag.length)], ust = dag[Math.ceil((1 - (1 - H.bootstrap.guven) / 2) * dag.length) - 1];
  return { durum: deger > 0 && alt > 0 ? 'KABUL' : 'RED', ...temel, cokus, eksik: eksik.length, hafta: L, istatistik: deger, aralik90: [alt, ust], a4 };
}

/**
 * A4 SONUÇSUZ izi: ay başına ortalama "bilinmiyor" oranı (birincil kapı × token, değerlendirme kümesi). 2 ay üst üste ≥ %30 → SONUÇSUZ.
 * @param aralik { bas, son } verilirse yalnız o günler; aralıkta KAYIT OLMAYAN takvim günü (boşluk) oran 1 sayılır (A4).
 */
function bilinmiyorAylik(t, aralik = null) {
  const ay = new Map();
  const ekle = (gn, oran) => { const k = gn.slice(0, 7); const x = ay.get(k) || { top: 0, n: 0, bosluk: 0 }; x.top += oran; x.n++; ay.set(k, x); return x; };
  const kayitli = new Map((t.gunler || []).map(g => [g.gun, g]));
  if (aralik && aralik.bas && aralik.son) {
    const son = (t.sonGun && t.sonGun < aralik.son) ? t.sonGun : aralik.son;
    for (let gn = aralik.bas; gn <= son; gn = gunEkle(gn, 1)) {
      const g = kayitli.get(gn);
      if (!g) ekle(gn, 1).bosluk++;
      else if (g.oran != null) ekle(gn, g.oran);
    }
  } else for (const g of t.gunler || []) if (g.oran != null) ekle(g.gun, g.oran);
  const l = [...ay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([a, x]) => ({ ay: a, oran: x.top / x.n, gun: x.n, bosluk: x.bosluk || 0 }));
  let ardisik = 0, sonucsuz = false;
  for (const x of l) { ardisik = x.oran >= 0.30 ? ardisik + 1 : 0; if (ardisik >= 2) sonucsuz = true; }
  return { aylar: l, sonucsuzRiski: sonucsuz };
}

module.exports = { H, birlesmeOku, gunluk, oncekiGunler, takipKur, takipHazirla, dikkatGunleri, karne, hdl1, bilinmiyorAylik, takipOku, takipAnahtarlari, bosTakip, yollar, kume, pencereIlerlet, tohumAnahtar, haftaBasi, gunEkle };
