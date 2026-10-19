/**
 * MODEL PORTFÖYLERİN KÂĞIT HESAPLARI (61.4, PLAN-HISSE-KAGIT.md) — Hücum botu gibi: sermayeyle başlar, modelin kararlarını
 * gerçek açılış fiyatlarından TAM ADET alıp satar, komisyon öder, temettü alır, bölünmede adet değişir.
 * ═══════════════════════════════════════════════════════════════════════════
 * Kullanıcı kararları (2026-10-13): panelde kâğıt hesap (dış aracı kurum yok) · tam adet · 837'nin Hücum yarısı simülasyon.
 * Midas komisyonu: ABD hissesi alım ya da satım başına 1,5 $; BIST'te komisyon YOK (kullanıcı 2026-10-13). Model ölçümü BIST için
 * %0,10 varsayar (kabul ölçümü değişmez) — kâğıt hesap gerçek aracı kurumu izler.
 *
 * KAYNAK — yeni karar ÜRETMEZ: modelin dondurulmuş kararları (kararlar.jsonl), günlük satırları (gunluk.jsonl: hangi günler
 * tamamlandı, 837 kol getirileri ve dengeleme günleri) ve kesilme dolumları (dolumlar.jsonl 'nakde'). Fiyatlar HAM (düzeltilmemiş)
 * açılış/kapanış — gerçek hesap gibi; temettü ve bölünme ayrıca işlenir. Kâğıt hesap modelin ilerisine geçmez (son gün = modelin
 * son yazılı günü).
 *
 * HİSSE MODELLERİ (m-qqq-m10 NYSE/USD, m-bist-m10 BIST/TRY), gün d:
 *   1. para yatır/çek (sermaye değişikliği) · 2. bölünme (adet × oran, küsurat önceki kapanıştan nakde) · 3. temettü (ex-gün,
 *   adet × tutar × (1 − stopaj)) · 4. kesilme (model hisseyi 'nakde' attıysa son kapanıştan sat) · 5. uygulama günü AÇILIŞINDA
 *   yeniden dengeleme: özsermaye(açılış) × ağırlık → hedef adet = aşağı yuvarla(hedef / (açılış × (1 + kayma))); önce SATIŞ,
 *   sonra ALIŞ; kalan nakitle kesir payı en büyük hedef hisselere birer adet (nakdi ve komisyonu aşmadan); |fark × fiyat| <
 *   max(eşik, özsermaye × %2) ise mevcut hissede düzeltme yok (giriş/çıkış hep yapılır). Açılış çubuğu olmayan hisse ertesi güne bekler. · 6. kapanışla değerleme.
 * 837 (takvim günü, USD): QQQ adet + "Hücum kolu" tutarı. İlk gün QQQ açılışta tam adet; Hücum kolu her gün modelin uydu kol
 *   getirisiyle büyür (gunluk.kollar.uydu oranı — modelle birebir). Modelin dengelendiği gün (gunluk.dengelendi) QQQ kapanışında
 *   50/50: fark kadar QQQ alınır/satılır (komisyon + kayma), tutar Hücum kolundan/koluna aktarılır (aktarım %0,1).
 * Nakit faizsiz (aracı kurum nakdi). Model nakde faiz verir — fark "model ↔ kâğıt" satırında görünür.
 *
 * API: hesapla(id, girdi) → { model, para, islemler, gunler, pozisyonlar, ozet, uyarilar } (SAF; veri girdide)
 *      fiyatKaynagi(V) → (sembol, borsa) → { bar(gun) → {o,c}|null, temettu: Map(gun→tutar), bolunme: Map(gun→oran) }
 *      AYAR (komisyon, kayma, stopaj, eşik varsayılanları)
 */
'use strict';

const AYAR = Object.freeze({
  USD: { komisyonSabit: 1.5, komisyonOran: 0, kayma: 0.0005, stopaj: 0.20, esik: 10, esikOran: 0.02, kesirli: false },
  TRY: { komisyonSabit: 0, komisyonOran: 0, kayma: 0.0005, stopaj: 0.15, esik: 300, esikOran: 0.02, kesirli: false },
  aktarim837: 0.001
});
const MODEL = Object.freeze({
  'm-qqq-m10': { tur: 'hisse', borsa: 'NYSE', para: 'USD', ad: 'Nasdaq Momentum 10', kiyas: 'k-qqq' },
  'm-bist-m10': { tur: 'hisse', borsa: 'BIST', para: 'TRY', ad: 'BIST Momentum 10', kiyas: 'k-xu030' },
  'm-837': { tur: '837', borsa: 'NYSE', para: 'USD', ad: '%50 QQQ + %50 Hücum', kiyas: 'k-qqq' }
});
const R2 = x => Math.round(x * 100) / 100;
const R6 = x => Math.round(x * 1e6) / 1e6;
const GUN_MS = 864e5;
const isoGun = t => new Date(t).toISOString().slice(0, 10);
const gunEkle = (g, n) => isoGun(Date.parse(g + 'T00:00:00Z') + n * GUN_MS);

function oranCoz(o) {
  const m = String(o || '').match(/^\s*([\d.]+)\s*[:/]\s*([\d.]+)\s*$/);
  const a = m ? +m[1] / +m[2] : NaN;
  return Number.isFinite(a) && a > 0 ? a : null;
}

/** Ham fiyat dosyasından (lib/tasarimci/veri.js ham) gün → {o,c}; temettü ve bölünme gün haritaları. Önbellekli. */
function fiyatKaynagi(V) {
  const onb = new Map();
  return (s, borsa) => {
    const k = `${borsa}|${s}`;
    if (onb.has(k)) return onb.get(k);
    let j = null;
    try { j = V.ham(borsa === 'BIST' ? `${s}.IS` : s); } catch (e) { j = null; }
    const m = new Map();
    for (const g of (j && j.gunler) || []) if (g.o > 0 && g.c > 0) m.set(isoGun(g.t), { o: g.o, c: g.c });
    const temettu = new Map(), bolunme = new Map();
    for (const x of (j && j.temettu) || []) if (x.miktar > 0) temettu.set(isoGun(x.t), (temettu.get(isoGun(x.t)) || 0) + x.miktar);
    for (const x of (j && j.bolunme) || []) { const o = oranCoz(x.oran); if (o) bolunme.set(isoGun(x.t), o); }
    const r = { var: !!j, bar: g => m.get(g) || null, temettu, bolunme };
    onb.set(k, r);
    return r;
  };
}

/** Sermaye akışları: gün ≤ d olan ve henüz uygulanmamış akışların toplamı (hafta sonu / tatil günü akışı sonraki işlem gününe düşer). */
function akisOkuyucu(akislar) {
  const l = (akislar || []).filter(x => x && x.gun && Number.isFinite(+x.tutar) && +x.tutar !== 0).sort((x, y) => (x.gun < y.gun ? -1 : 1));
  let i = 0;
  return (gun) => { let t = 0; while (i < l.length && l[i].gun <= gun) t += +l[i++].tutar; return t; };
}

function komisyon(a, tutar) { return R2(Math.max(a.komisyonSabit, 0) + Math.abs(tutar) * a.komisyonOran); }

/**
 * girdi: { kararlar (bu modelinkiler), gunluk (bu modelin satırları, sıralı), dolumlar (bu modelin), sermaye: { tutar, para },
 *          akislar: [{ gun, tutar }] (sermaye değişiklikleri; + yatır, − çek), fiyat: fiyatKaynagi(...), gunler(bas, son) →
 *          [gun] (borsa takvimi; 837 için takvim günü), ayar? (AYAR üzerine yazar), qqq? (837: fiyat('QQQ','NYSE')) }
 */
function hesapla(id, g) {
  const m = MODEL[id];
  if (!m) throw new Error(`kâğıt hesap: bilinmeyen model ${id}`);
  const a = { ...AYAR[m.para], ...((g.ayar && g.ayar[m.para]) || {}) };
  const out = { model: id, ad: m.ad, para: m.para, islemler: [], gunler: [], pozisyonlar: [], ozet: null, uyarilar: [] };
  const sat = (g.gunluk || []).filter(x => x.model === id).sort((x, y) => (x.gun < y.gun ? -1 : 1));
  if (!sat.length || !g.sermaye || !(g.sermaye.tutar > 0)) { out.ozet = { bos: true, neden: !sat.length ? 'Model henüz başlamadı (ilk gün satırı yok).' : 'Sermaye girilmedi (Portföy › Bu ay › Ayarlar).' }; return out; }
  const bas = sat[0].gun, son = sat[sat.length - 1].gun;
  return m.tur === '837' ? hesapla837(id, g, m, a, sat, bas, son, out) : hesaplaHisse(id, g, m, a, sat, bas, son, out);
}

function hesaplaHisse(id, g, m, a, sat, bas, son, out) {
  const satir = new Map(sat.map(x => [x.gun, x]));
  const kararlar = (g.kararlar || []).filter(k => k.model === id && k.agirlik).sort((x, y) => (x.uygulamaGunu < y.uygulamaGunu ? -1 : 1));
  const kesilme = new Map();
  for (const d of g.dolumlar || []) if (d.model === id && d.yon === 'nakde') kesilme.set(`${d.gun}|${d.s}`, d);
  const akisAl = akisOkuyucu(g.akislar);
  const F = (s) => g.fiyat(s, m.borsa);
  let nakit = 0;
  const adet = new Map(), ort = new Map(), sonKap = new Map(), gerceklesen = new Map();
  let bekleyen = null;   // { karar, w: Map, kalan: Set }
  let komToplam = 0, kIdx = 0, tepe = 0, maxDD = 0;
  const islem = (x) => { out.islemler.push({ gun: x.gun, tur: x.tur, s: x.s || null, adet: x.adet != null ? R6(x.adet) : null, fiyat: x.fiyat != null ? R6(x.fiyat) : null, tutar: R2(x.tutar || 0), komisyon: R2(x.komisyon || 0), neden: x.neden || '' }); komToplam += x.komisyon || 0; };
  const alKaydi = new Map();   // bu dengelemede hissenin alış satırı (kalan nakit adedi aynı satıra eklenir)
  const al = (gun, s, n, f, neden) => {
    const tutar = n * f, k = komisyon(a, tutar);
    nakit -= tutar + k;
    const once = adet.get(s) || 0;
    ort.set(s, (once * (ort.get(s) || 0) + tutar + k) / (once + n));
    adet.set(s, once + n);
    islem({ gun, tur: 'al', s, adet: n, fiyat: f, tutar, komisyon: k, neden });
    alKaydi.set(s, out.islemler[out.islemler.length - 1]);
  };
  const satis = (gun, s, n, f, neden) => {
    const tutar = n * f, k = komisyon(a, tutar);
    nakit += tutar - k;
    gerceklesen.set(s, (gerceklesen.get(s) || 0) + tutar - k - n * (ort.get(s) || 0));
    const kalan = (adet.get(s) || 0) - n;
    if (kalan > 0) adet.set(s, kalan); else { adet.delete(s); ort.delete(s); }
    islem({ gun, tur: 'sat', s, adet: n, fiyat: f, tutar, komisyon: k, neden });
  };

  for (const gun of g.gunler(bas, son)) {
    if (!satir.has(gun)) continue;   // model o günü yazmadı (atlanan gün) → kâğıt hesap da atlar
    if (gun === bas) { nakit = g.sermaye.tutar; islem({ gun, tur: 'yatir', tutar: nakit, neden: 'başlangıç sermayesi' }); }
    { const t = akisAl(gun); if (t) { nakit += t; islem({ gun, tur: t >= 0 ? 'yatir' : 'cek', tutar: Math.abs(t), neden: 'sermaye değişikliği (Bu ay › Ayarlar)' }); } }
    // Bölünme ve temettü (ex-gün, açılıştan önce)
    for (const s of [...adet.keys()]) {
      const f = F(s), n = adet.get(s);
      const o = f.bolunme.get(gun);
      if (o) {
        const yeni = n * o, tam = Math.floor(yeni + 1e-9), kusur = (yeni - tam) * ((sonKap.get(s) || 0) / o);
        adet.set(s, tam); ort.set(s, (ort.get(s) || 0) / o); if (sonKap.has(s)) sonKap.set(s, sonKap.get(s) / o);
        nakit += kusur;
        islem({ gun, tur: 'bolunme', s, adet: tam - n, tutar: kusur, neden: `bölünme ${R6(o)}× (${n} → ${tam} adet${kusur > 0 ? ', küsurat nakde' : ''})` });
        if (!tam) { adet.delete(s); ort.delete(s); }
      }
      const t = f.temettu.get(gun);
      if (t && adet.get(s)) { const brut = adet.get(s) * t, net = brut * (1 - a.stopaj); nakit += net; islem({ gun, tur: 'temettu', s, adet: adet.get(s), fiyat: t, tutar: net, neden: `temettü ${R6(t)} × ${adet.get(s)} adet, stopaj %${Math.round(a.stopaj * 100)}` }); }
    }
    // Kesilme (model hisseyi nakde attı)
    for (const s of [...adet.keys()]) {
      if (!kesilme.has(`${gun}|${s}`)) continue;
      satis(gun, s, adet.get(s), (sonKap.get(s) || 0) * (1 - a.kayma), 'verisi kesildi (model nakde aldı)');
      if (bekleyen) { bekleyen.kalan.delete(s); bekleyen.w.delete(s); }
    }
    // Uygulama günü gelen karar
    while (kIdx < kararlar.length && kararlar[kIdx].uygulamaGunu <= gun) {
      const k = kararlar[kIdx++];
      const w = new Map(Object.entries(k.agirlik).map(([s, x]) => [s, +x]));
      for (const s of adet.keys()) if (!w.has(s)) w.set(s, 0);
      bekleyen = { karar: k, w, kalan: new Set(w.keys()) };
    }
    if (bekleyen && bekleyen.kalan.size) dengele(gun, bekleyen);
    // Kapanış değerlemesi
    let oz = nakit; const poz = {};
    for (const [s, n] of adet) {
      const b = F(s).bar(gun); if (b) sonKap.set(s, b.c);
      const c = sonKap.get(s) || 0; oz += n * c; poz[s] = { adet: n, kapanis: R6(c), deger: R2(n * c) };
    }
    tepe = Math.max(tepe, oz); if (tepe > 0) maxDD = Math.max(maxDD, 1 - oz / tepe);
    out.gunler.push({ gun, nakit: R2(nakit), ozsermaye: R2(oz), poz, modelEndeks: satir.get(gun).endeks });
  }

  function dengele(gun, B) {
    const acilis = new Map();
    for (const s of B.kalan) { const b = F(s).bar(gun); if (b) acilis.set(s, b.o); }
    if (!acilis.size) return;
    const fiyatTah = s => acilis.get(s) || sonKap.get(s) || 0;
    let oz = nakit; for (const [s, n] of adet) oz += n * fiyatTah(s);
    const neden = `${B.karar.ilk ? 'ilk liste' : 'aylık karar'} ${B.karar.kararGunu}`;
    const plan = [];
    for (const s of acilis.keys()) {
      const w = B.w.get(s) || 0, o = acilis.get(s), n = adet.get(s) || 0;
      const ham = w > 0 ? (w * oz) / (o * (1 + a.kayma)) : 0;
      // kesirli: aracı kurum kesirli hisse veriyorsa (ayar) hedef adet = ham (6 hane); yoksa TAM adet (kullanıcı kararı K2)
      let hedef = a.kesirli ? R6(ham) : Math.floor(ham + 1e-9);
      let fark = hedef - n;
      // Mevcut hissede küçük ağırlık düzeltmesi yapılmaz: fark < max(eşik, özsermaye × eşikOran) (1,5 $ komisyonla 20 $ düzeltme
      // %7,5 maliyet olurdu). Listeye giriş/çıkış her zaman yapılır.
      if (w > 0 && n > 0 && fark !== 0 && Math.abs(fark) * o < Math.max(a.esik, (a.esikOran || 0) * oz)) { fark = 0; hedef = n; }
      plan.push({ s, w, o, n, hedef, fark, kesir: ham - Math.floor(ham + 1e-9) });
      B.kalan.delete(s);
    }
    for (const p of plan.filter(x => x.fark < 0)) satis(gun, p.s, -p.fark, p.o * (1 - a.kayma), p.hedef === 0 ? `${neden}: listeden çıktı` : `${neden}: ağırlık eşitleme`);
    alKaydi.clear();
    for (const p of plan.filter(x => x.fark > 0).sort((x, y) => y.w - x.w)) {
      const f = p.o * (1 + a.kayma);
      let n = p.fark;
      if (a.kesirli) { if (nakit < n * f + komisyon(a, n * f)) n = R6(Math.max(0, (nakit - komisyon(a, nakit)) / f)); }
      else while (n > 0 && nakit < n * f + komisyon(a, n * f)) n--;
      if (n > 0) al(gun, p.s, n, f, p.n === 0 ? `${neden}: listeye girdi` : `${neden}: ağırlık eşitleme`);
    }
    // Kalan nakit: kesir payı en büyük hedef hisselere birer adet. Hisse bu dengelemede zaten alındıysa aynı satıra eklenir
    // (komisyon değişmez — sabit komisyon emir başına); alınmadıysa yeni emir = yeni komisyon, o da hesaba katılır.
    for (const p of plan.filter(x => !a.kesirli && x.w > 0 && x.fark >= 0).sort((x, y) => y.kesir - x.kesir)) {
      const f = p.o * (1 + a.kayma), x = alKaydi.get(p.s);
      if (x) {
        const yeniTutar = x.tutar + f, ekKom = komisyon(a, yeniTutar) - x.komisyon;
        if (nakit < f + ekKom) continue;
        const once = adet.get(p.s);
        nakit -= f + ekKom; komToplam += ekKom;
        ort.set(p.s, (once * ort.get(p.s) + f + ekKom) / (once + 1)); adet.set(p.s, once + 1);
        x.adet = R6(x.adet + 1); x.tutar = R2(yeniTutar); x.komisyon = R2(x.komisyon + ekKom);
      } else if (nakit >= f + komisyon(a, f)) al(gun, p.s, 1, f, `${neden}: kalan nakit`);
    }
  }

  const sonG = out.gunler[out.gunler.length - 1];
  const sonKarar = kararlar.filter(k => k.uygulamaGunu <= son).pop() || null;
  out.pozisyonlar = [...adet].map(([s, n]) => {
    const c = sonKap.get(s) || 0, deger = n * c, mal = n * (ort.get(s) || 0);
    return { s, adet: n, ortMaliyet: R6(ort.get(s) || 0), kapanis: R6(c), deger: R2(deger), kz: R2(deger - mal), kzYuzde: mal > 0 ? R6(deger / mal - 1) : null, pay: sonG && sonG.ozsermaye > 0 ? R6(deger / sonG.ozsermaye) : null, gerceklesen: R2(gerceklesen.get(s) || 0) };
  }).sort((x, y) => y.deger - x.deger);
  const yatirilan = out.islemler.filter(i => i.tur === 'yatir').reduce((t, i) => t + i.tutar, 0) - out.islemler.filter(i => i.tur === 'cek').reduce((t, i) => t + i.tutar, 0);
  out.ozet = ozetKur(out, sonG, yatirilan, komToplam, maxDD, g.sermaye, sonKarar, bekleyen);
  return out;
}

function hesapla837(id, g, m, a, sat, bas, son, out) {
  const Q = g.qqq || g.fiyat('QQQ', 'NYSE');
  const akisAl = akisOkuyucu(g.akislar);
  const satir = new Map(sat.map(x => [x.gun, x]));
  const W = 0.5;
  let nakit = 0, n = 0, ort = 0, hucum = 0, sonKap = 0, komToplam = 0, tepe = 0, maxDD = 0, gerceklesen = 0;
  const islem = (x) => { out.islemler.push({ gun: x.gun, tur: x.tur, s: x.s || null, adet: x.adet != null ? R6(x.adet) : null, fiyat: x.fiyat != null ? R6(x.fiyat) : null, tutar: R2(x.tutar || 0), komisyon: R2(x.komisyon || 0), neden: x.neden || '' }); komToplam += x.komisyon || 0; };
  const qqqAl = (gun, k, f, neden) => { const t = k * f, c = komisyon(a, t); nakit -= t + c; ort = (n * ort + t + c) / (n + k); n += k; islem({ gun, tur: 'al', s: 'QQQ', adet: k, fiyat: f, tutar: t, komisyon: c, neden }); };
  const qqqSat = (gun, k, f, neden) => { const t = k * f, c = komisyon(a, t); nakit += t - c; gerceklesen += t - c - k * ort; n -= k; if (!n) ort = 0; islem({ gun, tur: 'sat', s: 'QQQ', adet: k, fiyat: f, tutar: t, komisyon: c, neden }); };
  let onceki = null;
  for (let gun = bas; gun <= son; gun = gunEkle(gun, 1)) {
    const r = satir.get(gun); if (!r) continue;
    const b = Q.bar(gun);
    if (gun === bas) {
      const E = g.sermaye.tutar;
      nakit = E; islem({ gun, tur: 'yatir', tutar: E, neden: 'başlangıç sermayesi' });
      const uydu0 = W * E; nakit -= uydu0; hucum = uydu0;
      islem({ gun, tur: 'aktarim', s: 'HUCUM', tutar: uydu0, neden: 'Hücum koluna (simülasyon) %50' });
      if (b) { const f = b.o * (1 + a.kayma); let k = a.kesirli ? R6((nakit - a.komisyonSabit) / f) : Math.floor((nakit - a.komisyonSabit) / f + 1e-9); if (!a.kesirli) while (k > 0 && nakit < k * f + komisyon(a, k * f)) k--; if (k > 0) qqqAl(gun, k, f, 'ilk yerleşim: QQQ %50'); }
      hucum *= r.kollar ? (r.kollar.uydu / (100 * W)) : 1;   // ilk gün kol getirisi (model: H = 100·w·hr)
    } else {
      { const t = akisAl(gun); if (t) { nakit += t; islem({ gun, tur: t >= 0 ? 'yatir' : 'cek', tutar: Math.abs(t), neden: 'sermaye değişikliği (Bu ay › Ayarlar)' }); } }
      const once = onceki && onceki.kollar ? onceki.kollar.uydu : null, simdi = r.dengelendi && r.kollarOnce ? r.kollarOnce.uydu : (r.kollar ? r.kollar.uydu : null);
      if (once > 0 && simdi > 0) hucum *= simdi / once;
      if (b && Q.bolunme.get(gun) && n) {
        const o = Q.bolunme.get(gun), yeni = n * o, tam = Math.floor(yeni + 1e-9), kusur = (yeni - tam) * (sonKap / o);
        nakit += kusur; ort /= o; sonKap /= o;
        islem({ gun, tur: 'bolunme', s: 'QQQ', adet: tam - n, tutar: kusur, neden: `bölünme ${R6(o)}× (${n} → ${tam} adet)` });
        n = tam;
      }
      if (b && Q.temettu.get(gun) && n) { const t = Q.temettu.get(gun), net = n * t * (1 - a.stopaj); nakit += net; islem({ gun, tur: 'temettu', s: 'QQQ', adet: n, fiyat: t, tutar: net, neden: `temettü ${R6(t)} × ${n} adet, stopaj %${Math.round(a.stopaj * 100)}` }); }
    }
    if (b) sonKap = b.c;
    if (r.dengelendi && gun !== bas && b) {
      const E = nakit + n * b.c + hucum, hedef = W * E, fark = hedef - n * b.c;
      if (fark > 0) {
        const f = b.c * (1 + a.kayma); let k = a.kesirli ? R6((fark - a.komisyonSabit) / f) : Math.floor(fark / f + 1e-9);
        const gerekli = Math.max(0, k * f + komisyon(a, k * f) - nakit);
        if (k > 0 && gerekli > 0) { const A = gerekli / (1 - AYAR.aktarim837); hucum -= A; nakit += gerekli; islem({ gun, tur: 'aktarim', s: 'HUCUM', tutar: -A, komisyon: A - gerekli, neden: 'dengeleme: Hücum kolundan QQQ\'ya' }); }
        if (a.kesirli) { if (nakit < k * f + komisyon(a, k * f)) k = R6(Math.max(0, (nakit - komisyon(a, nakit)) / f)); } else while (k > 0 && nakit < k * f + komisyon(a, k * f)) k--;
        if (k > 0) qqqAl(gun, k, f, 'dengeleme (Hücum payı bant dışında)');
      } else if (fark < 0) {
        const f = b.c * (1 - a.kayma); const k = Math.min(n, a.kesirli ? R6(-fark / f) : Math.floor(-fark / f + 1e-9));
        if (k > 0) {
          qqqSat(gun, k, f, 'dengeleme (Hücum payı bant dışında)');
          const A = k * f - komisyon(a, k * f), net = A * (1 - AYAR.aktarim837);
          nakit -= A; hucum += net; islem({ gun, tur: 'aktarim', s: 'HUCUM', tutar: net, komisyon: A - net, neden: 'dengeleme: QQQ\'dan Hücum koluna' });
        }
      }
    }
    const oz = nakit + n * sonKap + hucum;
    tepe = Math.max(tepe, oz); if (tepe > 0) maxDD = Math.max(maxDD, 1 - oz / tepe);
    out.gunler.push({ gun, nakit: R2(nakit), ozsermaye: R2(oz), poz: n ? { QQQ: { adet: n, kapanis: R6(sonKap), deger: R2(n * sonKap) } } : {}, hucum: R2(hucum), modelEndeks: r.endeks });
    onceki = r;
  }
  const sonG = out.gunler[out.gunler.length - 1];
  out.pozisyonlar = [];
  if (n) out.pozisyonlar.push({ s: 'QQQ', adet: n, ortMaliyet: R6(ort), kapanis: R6(sonKap), deger: R2(n * sonKap), kz: R2(n * sonKap - n * ort), kzYuzde: ort > 0 ? R6(sonKap / ort - 1) : null, pay: sonG ? R6(n * sonKap / sonG.ozsermaye) : null, gerceklesen: R2(gerceklesen) });
  out.pozisyonlar.push({ s: 'HUCUM', ad: 'Hücum kolu (simülasyon)', adet: null, ortMaliyet: null, kapanis: null, deger: R2(hucum), kz: null, kzYuzde: null, pay: sonG ? R6(hucum / sonG.ozsermaye) : null, simulasyon: true });
  const yatirilan = out.islemler.filter(i => i.tur === 'yatir').reduce((t, i) => t + i.tutar, 0) - out.islemler.filter(i => i.tur === 'cek').reduce((t, i) => t + i.tutar, 0);
  out.ozet = ozetKur(out, sonG, yatirilan, komToplam, maxDD, g.sermaye, null, null);
  return out;
}

function ozetKur(out, sonG, yatirilan, komToplam, maxDD, sermaye, sonKarar, bekleyen) {
  if (!sonG) return { bos: true, neden: 'Henüz tamamlanan gün yok.' };
  const ilk = out.gunler[0];
  const modelTutar = ilk && ilk.modelEndeks ? R2(sermaye.tutar * sonG.modelEndeks / 100) : null;
  return {
    bas: ilk.gun, son: sonG.gun, ozsermaye: sonG.ozsermaye, nakit: sonG.nakit, yatirilan: R2(yatirilan),
    kar: R2(sonG.ozsermaye - yatirilan), getiri: yatirilan > 0 ? R6(sonG.ozsermaye / yatirilan - 1) : null, maxDD: R6(maxDD),
    komisyonToplam: R2(komToplam), islemSayisi: out.islemler.filter(i => i.tur === 'al' || i.tur === 'sat').length,
    modelTutar, modelFark: modelTutar != null ? R2(sonG.ozsermaye - modelTutar) : null,
    sonKarar: sonKarar ? { kararGunu: sonKarar.kararGunu, uygulamaGunu: sonKarar.uygulamaGunu, liste: sonKarar.liste || null, aday: sonKarar.aday || null } : null,
    bekleyenEmir: bekleyen && bekleyen.kalan.size ? [...bekleyen.kalan] : []
  };
}

/**
 * Zamanlayıcı adımı (lib/tasarimci/zamanlayici.js tik, model satırlarından SONRA). Okur: sermaye.json; yazar: kagit-akis.json
 * (sermaye değişikliği kaydı — yalnız eklenir) ve kagit.json (üç hesabın son hâli; her tikte baştan hesaplanır, deterministik).
 * Sermaye: ilk görülen tutar BAŞLANGIÇ; sonra tutar değişirse fark o gün para yatırma/çekme olarak eklenir (getiri bozulmaz).
 * Önceki kagit.json'daki kapanmış günlerin işlemleri yeniden hesapta DEĞİŞTİYSE uyarı (veri revizyonu).
 * Ayarlar (sermaye.json): kesirli (true → ABD kesirli adet), minIslemUSD (ABD eşik), kagit.{USD,TRY} (komisyon/kayma/stopaj üzerine yazar).
 * ops: { DF, V, T, kararlar, gunluk, dolumlar, bugun, simdi } → kagit.json içeriği
 */
function tikHesapla({ DF, V, T, kararlar, gunluk, dolumlar, bugun, simdi = Date.now() }) {
  const sj = DF.jsonOku('sermaye.json') || {};
  const akis = DF.jsonOku('kagit-akis.json') || { surum: 1, modeller: {} };
  let akisDegisti = false;
  const F = fiyatKaynagi(V);
  const eski = DF.jsonOku('kagit.json');
  const sonuc = { surum: 1, guncelleme: new Date(simdi).toISOString(), modeller: {}, uyarilar: [] };
  for (const id of Object.keys(MODEL)) {
    const m = MODEL[id], x = sj.modeller && sj.modeller[id];
    const tutar = x && Number.isFinite(+x.tutar) && +x.tutar > 0 ? +x.tutar : 0;
    let a = akis.modeller[id];
    if (!a && tutar > 0) { a = akis.modeller[id] = { baslangic: tutar, para: m.para, kayit: bugun, akislar: [] }; akisDegisti = true; }
    if (a) {
      const beklenen = a.baslangic + a.akislar.reduce((t, y) => t + y.tutar, 0);
      if (tutar > 0 && Math.abs(tutar - beklenen) > 1e-6) { a.akislar.push({ gun: bugun, tutar: R2(tutar - beklenen), kayit: new Date(simdi).toISOString() }); akisDegisti = true; }
    }
    const minIslem = sj.minIslemUSD !== null && sj.minIslemUSD !== '' && Number.isFinite(+sj.minIslemUSD) ? { esik: +sj.minIslemUSD } : {};
    const ayar = { USD: { ...minIslem, ...(sj.kesirli === true ? { kesirli: true } : {}), ...((sj.kagit && sj.kagit.USD) || {}) }, TRY: { ...((sj.kagit && sj.kagit.TRY) || {}) } };
    const gunlerF = m.tur === '837' ? () => [] : (b, s) => T.islemGunleri(b, s, m.borsa).map(T.iso);
    let r;
    try {
      r = hesapla(id, { kararlar, gunluk, dolumlar, sermaye: a ? { tutar: a.baslangic, para: m.para } : null, akislar: a ? a.akislar : [], fiyat: F, gunler: gunlerF, ayar });
    } catch (e) { r = { model: id, ad: m.ad, para: m.para, islemler: [], gunler: [], pozisyonlar: [], ozet: { bos: true, neden: `hesaplanamadı: ${e.message}` }, uyarilar: [] }; }
    r.ayar = { ...AYAR[m.para], ...ayar[m.para] };
    const once = eski && eski.modeller && eski.modeller[id];
    if (once && once.islemler && once.ozet && once.ozet.son) {
      const anahtar = i => `${i.gun}|${i.tur}|${i.s}|${i.adet}|${i.tutar}`;
      const kapali = l => l.filter(i => i.gun < once.ozet.son).map(anahtar).join('\n');
      if (kapali(once.islemler) !== kapali(r.islemler)) { const u = `${m.ad} kâğıt hesabı: geçmiş işlemler yeniden hesapta değişti (fiyat verisi revizyonu ya da ayar değişikliği) — son hâl gösteriliyor`; r.uyarilar.push(u); sonuc.uyarilar.push(u); }
    }
    sonuc.modeller[id] = r;
  }
  if (akisDegisti) DF.jsonYaz('kagit-akis.json', akis);
  DF.jsonYaz('kagit.json', sonuc);
  return sonuc;
}

/**
 * Telegram özetleri (saf): son bildirilen günden SONRA alım/satım olan her (model, gün) için bir mesaj.
 * sonBildirilen: { model: 'YYYY-MM-DD' } (yoksa model ilk kez görülüyor → geçmiş için mesaj YOK, yalnız işaret ilerler).
 * Döndürür: { mesajlar: [{ model, gun, baslik, satirlar }], yeniSon }
 */
function bildirimler(sonuc, sonBildirilen = {}) {
  const mesajlar = [], yeniSon = { ...sonBildirilen };
  const SIM = { USD: '$', TRY: '₺' };
  const para = (x, p) => `${x < 0 ? '−' : ''}${SIM[p] || ''}${Math.abs(x).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
  for (const [id, x] of Object.entries((sonuc && sonuc.modeller) || {})) {
    if (!x.ozet || x.ozet.bos) continue;
    const ilk = !(id in sonBildirilen);
    const esik = sonBildirilen[id] || '';
    const gunler = [...new Set(x.islemler.filter(i => (i.tur === 'al' || i.tur === 'sat') && i.gun > esik).map(i => i.gun))].sort();
    if (gunler.length) yeniSon[id] = gunler[gunler.length - 1]; else if (ilk) yeniSon[id] = x.ozet.son;
    if (ilk) continue;
    for (const gun of gunler) {
      const l = x.islemler.filter(i => i.gun === gun && (i.tur === 'al' || i.tur === 'sat'));
      const sat = l.filter(i => i.tur === 'sat'), al = l.filter(i => i.tur === 'al');
      const g = x.gunler.find(z => z.gun === gun);
      const kom = l.reduce((t, i) => t + (i.komisyon || 0), 0);
      mesajlar.push({ model: id, gun, baslik: `${x.ad} — ${gun} alım-satım (kâğıt hesap)`, satirlar: [
        sat.length ? `<b>Satış (${sat.length}):</b> ${sat.map(i => `${i.s} ${i.adet}`).join(', ')}` : null,
        al.length ? `<b>Alış (${al.length}):</b> ${al.map(i => `${i.s} ${i.adet}`).join(', ')}` : null,
        // K6: Telegram'a TUTAR gitmez (sermaye gizli kalır) — yalnız emir sayısı ve yüzde getiri.
        `${l.length} emir${kom > 0 ? ' (komisyonlu)' : ''} · başlangıçtan ${x.ozet.getiri != null ? `${x.ozet.getiri >= 0 ? '+' : '−'}%${Math.abs(x.ozet.getiri * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—'}`,
        'Ayrıntı: panel › Botlar › Hisse yapıları'
      ].filter(Boolean) });
    }
  }
  return { mesajlar, yeniSon };
}

module.exports = { hesapla, tikHesapla, bildirimler, fiyatKaynagi, komisyon, oranCoz, AYAR, MODEL };
