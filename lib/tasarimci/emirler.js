/**
 * PORTFÖY TASARIMCISI — "BU AY": ÖNERİ → GERÇEK PORTFÖY EMİR LİSTESİ → "UYGULADIM" KAYITLARI (F4, 61.0).
 * PLAN-PORTFOY-TASARIMCI.md (a) katman 2, (c) C5, (d) `emirler`; kararlar T3 (tek onay → Portföyüm), T4 (Midas), Ö1, Ö2, Ö4.
 * Öz test: node scripts/tasarimci-selftest.js (K bölümü, uçtan uca örnek Portföyüm verisiyle).
 *
 * SAF MODÜL (dosya yazmaz). Girdi: model hedefi (dondurulmuş karar) + Portföyüm'ün bugünkü durumu (lib/portfoyum depo +
 * değerleme) + model sermayesi (data/tasarimci/sermaye.json — api.js okur). Çıktı: emir satırları ve Portföyüm kayıt nesneleri.
 * Emir VERMEZ (aracı kurum API'si yok, K1): kullanıcı emri Midas'ta girer, "Uyguladım" ile Portföyüm'e kaydeder.
 *
 * KURALLAR
 *   · Hedef tutar = hedef tabanı × ağırlık (model para biriminde: Nasdaq M10 / 837 USD, BIST M10 TL). M10 tabanı (Ö8) =
 *     sermaye × (model endeksi / 100) — model kazancı yeniden yatırır; kart (/oneri) ve liste AYNI tanım (api.js tutarHesapla).
 *     Gerçek pozisyon değerinin model değerinden sapması ayrı uyarı satırıdır.
 *   · Mevcut adet VARLIK KİMLİĞİYLE toplanır: aynı para birimindeki sembol | Yahoo kodu | sembol = kod (ör. elle girilmiş
 *     "ASELS.IS") eşleşen bütün varlıklar (varlikEsle).
 *   · Ay içi DONDURMA (O3): ayın ilk "Uyguladım"ında hedef adetler (+ fiyat, taban) dondurulur (api.js uygulama/YYYY-MM.json);
 *     iptal edilmemiş uygulama oldukça liste dondurulmuş hedefle hesaplanır — fiyat oynaması yeni satır açmaz.
 *   · TAM ADET (Ö2): hedef adet = ⌊hedef tutar / tahmini fiyat⌋; kesirli (ayar `kesirli: true`) 6 haneye aşağı. Kalan
 *     tutar "tam adetten kalan sapma" olarak gösterilir (nakitte kalır).
 *   · Tahmini fiyat = son kapanış (lib/tasarimci/veri.js ham dosyası, düzeltilmemiş kapanış `c`); yoksa Portföyüm fiyatı.
 *   · Modelin pozisyonu = hedef hesaptaki (hesap türü: abd-araci / bist-araci) hedef listesindeki ya da önceki listedeki
 *     sembollerin adedi. Hesaptaki DİĞER varlıklara dokunulmaz.
 *   · Önce SAT, sonra (837) AKTARIM, sonra AL. |işlem tutarı| < minIslemUSD olan satır yazılmaz (eşik altı listesinde görünür).
 *   · Neden: "listeden çıktı" / "listeye girdi" / "listede kaldı — ağırlığa dengeleme" / "ilk yerleşim".
 *   · 837 (t1-s2.json, bant ±10 puan, Ö4): çekirdek QQQ (ABD hesabı) + uydu Hücum = Binance HESABININ toplam değeri.
 *     İLK YERLEŞİM (Y3) = bu model için Portföyüm'de iptal edilmemiş tasarımcı kaydı YOK: sermaye esas — QQQ sermaye × %50,
 *     ABD → Binance aktarımı sermaye × %50 (Binance'te önceden duran para sayılmaz; "dahil edilsin mi" bilgisi). Sonra Hücum
 *     payı = Binance / (QQQ + Binance); %40–%60 İÇİNDEYSE işlem ve aktarım YOK; dışındaysa güncel toplamın tam 50/50'si.
 *     Binance → ABD aktarımında Binance USD nakdi yetmiyorsa satır uygulanamaz (önce kripto satışı Portföyüm'e, O6).
 *
 * API
 *   KALEM (sabit)  model başına hesap türü / para / sınıf / Yahoo kodu
 *   hedefGenislet(model, oneri, { onceki? }) → { model, para, kararGunu, uygulamaGunu, ilk, kalemler, hesapHedefleri, onceki, dengeleme }
 *   portfoyumDurumu({ bugun, simdi? }) → { D, deg, kayitlar, hatalar }   (lib/portfoyum depo.yukle + degerleme; YALNIZ okur)
 *   hesapSec(D, hesapTuru, tercih) → { hesap|null, secenekler, not }
 *   emirListesi(hedef, durum, { kesirli, minIslemUSD, hesap, sermaye, fiyatBul, usdtry, bugun }) → liste (aşağıda)
 *   uygulamaAnahtarlari(kayitlar, D, { ay, model }) → Map anahtar → [{ id, uygulama, zaman }]   (iptal edilmemiş)
 *   uygulaKayitlari(satirlar, { D, ay, model, tarih, uygulama }) → { kayitlar, yeniVarliklar, hatalar }   (gunIciSira sat 100+/aktarım 200+/al 300+)
 *   hedefKaydi(listeler, { D, deg, duzey, usdtry, bant, ay }) → { kayit, yeniVarliklar, dokum, hatalar }
 *   imza(nesne) → hex (önizleme ↔ onay)
 */
'use strict';
const path = require('path');
const DF = require('./defter');
const T = require('./takvim');
const MD = require('./model');

const KALEM = Object.freeze({
  'm-qqq-m10': { hesapTuru: 'abd-araci', para: 'USD', sinif: 'hisse', kod: s => s, hesapAd: 'ABD aracı kurum (Midas)' },
  'm-bist-m10': { hesapTuru: 'bist-araci', para: 'TRY', sinif: 'hisse', kod: s => s + '.IS', hesapAd: 'BIST aracı kurum (Midas)' },
  'm-837': { hesapTuru: 'abd-araci', para: 'USD', sinif: 'hisse-endeks', kod: s => s, hesapAd: 'ABD aracı kurum (Midas)' },
});
const HESAP_AD = { 'abd-araci': 'ABD aracı kurum (Midas)', 'bist-araci': 'BIST aracı kurum (Midas)', binance: 'Binance' };
/**
 * Varsayılanlar. Komisyon (kullanıcı 2026-10-13, Midas): ABD hissesi emir başına 1,5 $, BIST komisyonsuz. Nakit tamponu (B2,
 * DENETIM-CANLI-PORTFOY): liste cuma kapanışıyla hesaplanır, emir pazartesi açılışta girilir — açılış farkı ve komisyon için
 * hedef tabanın %0,5'i alışa ayrılmaz. Düzeltme eşiği (B8): listede KALAN hissede ağırlık düzeltmesi yalnız fark ≥ max(minIslem,
 * taban × %2) ise (kâğıt hesapla aynı kural; 1,5 $ komisyonla 20 $'lık düzeltme %7,5 maliyet olurdu).
 */
const VARSAYILAN = Object.freeze({ kesirli: false, minIslemUSD: 10, komisyon: { USD: { sabit: 1.5, oran: 0 }, TRY: { sabit: 0, oran: 0 } }, tamponOran: 0.005, duzeltmeOran: 0.02 });
/** Emir başına tahmini komisyon (model para biriminde). */
const ucretTahmini = (kom, para, tutar) => { const k = (kom && kom[para]) || { sabit: 0, oran: 0 }; return R2((k.sabit || 0) + Math.abs(tutar) * (k.oran || 0)); };
const EPS = 1e-9;
const R2 = x => Math.round(x * 100) / 100;
/** Kullanıcı metni için para: "5.218,39 $" / "12.000 ₺" (tr-TR, ek yok — "USD'ı" yazılmaz). */
function paraYaz(x, para) {
  const t = Number(x || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/^-/, '−');
  return `${t} ${para === 'TRY' ? '₺' : para === 'USD' ? '$' : para || ''}`.trim();
}
/**
 * NAKİT "SONRA" — TEK YUVARLAMA KURALI (denetim 61.1 D5): emir listesi (bitir) ve Uyguladım önizlemesi (api.js) aynı
 * sonucu verir. Her kalem kuruşa (aracı kurum gibi), mevcut nakit kuruşa, toplam kuruşa yuvarlanır.
 *   nakitKalemleri(kayitlar) → Map(hesap → [işaretli tutar])   (al: −(adet×fiyat) − ücret, sat: +(adet×fiyat) − ücret,
 *                                                               aktarım: kaynak −tutar, hedef +tutar; emir satırı {yon, tutar} de olur)
 *   nakitSonra(mevcut, kalemler) → R2(R2(mevcut) + Σ R2(kalem))
 */
function nakitKalemleri(kayitlar) {
  const m = new Map();
  const ekle = (h, t) => { if (!h) return; if (!m.has(h)) m.set(h, []); m.get(h).push(t); };
  for (const x of kayitlar || []) {
    const islem = x.islem || (x.tur === 'aktarim' ? 'transfer' : x.yon);
    const ucret = R2(Number(x.ucret) || 0);
    const brut = x.adet != null && x.fiyat != null ? R2(Number(x.adet) * Number(x.fiyat)) : R2(Number(x.tutar) || 0);
    if (islem === 'transfer') { const t = R2(Number(x.tutar) || 0); ekle(x.hesap, -t); ekle(x.hedefHesap, t); }
    else if (islem === 'al') ekle(x.hesap, -brut - ucret);
    else if (islem === 'sat') ekle(x.hesap, brut - ucret);
  }
  return m;
}
const nakitSonra = (mevcut, kalemler) => R2(R2(Number(mevcut) || 0) + (kalemler || []).reduce((a, t) => a + R2(t), 0));

/**
 * Ö12 "en büyük kalan" yuvarlaması (yalnız gerçek uygulama; model değişmez): adetler önce ⌊hedef ÷ fiyat⌋ (çağıran),
 * sonra kalan nakitle kesir payı (hedef ÷ fiyat − ⌊⌋) en büyük hisselere sırayla BİRER adet daha — nakdi aşmadan.
 * kalemler: [{ k:{sembol}, f:{fiyat}, ht, hAdet }] (yerinde değişir: hAdet+1, ek=true). Döner: ek adet verilen semboller.
 */
function enBuyukKalan(kalemler, kalanNakit) {
  let kalan = kalanNakit;
  const sirali = kalemler.map(x => ({ x, pay: x.ht / x.f.fiyat - x.hAdet })).filter(o => o.pay > EPS)
    .sort((a, b) => b.pay - a.pay || (a.x.k.sembol < b.x.k.sembol ? -1 : 1));
  const ek = [];
  for (const { x } of sirali) {
    if (x.f.fiyat <= kalan + 1e-6) { x.hAdet += 1; x.ek = true; kalan -= x.f.fiyat; ek.push(x.k.sembol); }
  }
  return ek;
}
const asagi = (x, hane) => { const k = 10 ** hane; return Math.floor(x * k + 1e-7) / k; };

/** Model kimliği ya da sabitleme nesnesi → sabitleme nesnesi. */
const modelBul = (m) => (typeof m === 'string' ? MD.modelSab(m) : m);

/**
 * Dondurulmuş karar → işlenebilir hedef. oneri: karar satırı ({ agirlik, kararGunu, uygulamaGunu, ilk, eksikVeri }) ya da
 * /oneri model girdisi ({ karar, hedef: [{ s|kol, agirlik }] }). onceki: önceki kararın sembolleri (neden için).
 */
function hedefGenislet(model, oneri, { onceki = null } = {}) {
  const m = modelBul(model);
  if (!m) throw new Error(`emirler: bilinmeyen model ${model}`);
  const k = oneri && oneri.karar ? oneri.karar : (oneri || {});
  let ag = oneri && oneri.agirlik ? oneri.agirlik : null;
  if (!ag && oneri && Array.isArray(oneri.hedef)) ag = Object.fromEntries(oneri.hedef.map(h => [h.s || h.kol, h.agirlik]));
  const K = KALEM[m.id];
  const out = { model: m.id, ad: m.ad, para: K.para, kararGunu: k.kararGunu || null, uygulamaGunu: k.uygulamaGunu || null, ilk: !!k.ilk || !onceki,
    eksikVeri: k.eksikVeri || [], kalemler: [], hesapHedefleri: [], onceki: onceki ? [...onceki] : [], dengeleme: null };
  if (m.id === 'm-837') {
    const kollar = m.kollar.map(x => ({ ...x, agirlik: ag && ag[x.kol] != null ? ag[x.kol] : x.agirlik }));
    for (const x of kollar) {
      if (x.strateji === 'qqq-altut') out.kalemler.push({ sembol: 'QQQ', kod: 'QQQ', agirlik: x.agirlik, hesapTuru: x.hesapTuru || 'abd-araci', para: 'USD', sinif: 'hisse-endeks', kol: x.kol, ad: 'Invesco QQQ Trust' });
      else out.hesapHedefleri.push({ kol: x.kol, strateji: x.strateji, agirlik: x.agirlik, hesapTuru: x.hesapTuru || 'binance', para: 'USD', ad: 'Hücum (Binance hesabının tamamı; botun işi)' });
    }
    out.dengeleme = MD.dengeleme837();
    out.onceki = ['QQQ'];
    return out;
  }
  for (const [s, w] of Object.entries(ag || {})) {
    if (!(w > 0)) continue;
    out.kalemler.push({ sembol: s, kod: K.kod(s), agirlik: w, hesapTuru: K.hesapTuru, para: K.para, sinif: K.sinif, kol: 'm10', ad: s });
  }
  return out;
}

/** Portföyüm'ün bugünkü durumu (YALNIZ okur; anlık görüntü yazmaz). */
function portfoyumDurumu({ bugun, simdi } = {}) {
  const depo = require('../portfoyum/depo'), G = require('../portfoyum/degerleme'), PM = require('../portfoyum/model');
  const g = bugun || PM.yerelGun();
  const r = depo.yukle({ bugun: g });
  const S = G.seriler(r.D, { kurOnbellek: depo.jsonOku('kurlar.json'), binanceOnbellek: (depo.jsonOku('fiyat-onbellek.json') || {}).fiyatlar || {} });
  const deg = G.degerle(r.D, r.muh, { bugun: g, seriler: S, simdiMs: simdi != null ? simdi : Date.now() });
  return { D: r.D, deg, kayitlar: r.kayitlar, hatalar: r.hatalar, bugun: g };
}

/** Aynı para birimindeki eşleşen varlık kimlikleri: sembol | Yahoo kodu | sembol = kod (ör. "ASELS.IS") | kod = sembol. (Y1) */
function varlikEsle(D, sembol, kod, para) {
  const S = String(sembol || '').toUpperCase(), Kd = String(kod || '').toUpperCase();
  const ids = new Set();
  for (const v of D.varliklar.values()) {
    if (v.para !== para) continue;
    const vs = String(v.sembol || '').toUpperCase(), vk = String(v.kod || '').toUpperCase();
    if (vs === S || (Kd && (vk === Kd || vs === Kd)) || (vk && vk === S)) ids.add(v.id);
  }
  return ids;
}
/** Eşleşen varlıklardan biri (önce sembolü birebir aynı olan). */
function varlikIlk(D, sembol, kod, para) {
  const ids = varlikEsle(D, sembol, kod, para);
  const l = [...ids].map(id => D.varliklar.get(id));
  return l.find(v => v.sembol === sembol) || l[0] || null;
}

/** Hesap türüne göre açık hesap seç (tercih edilen kimlik varsa o). */
function hesapSec(D, hesapTuru, tercih) {
  const acik = [...D.hesaplar.values()].filter(h => h.hesapTuru === hesapTuru && h.durum === 'acik');
  const secenekler = acik.map(h => ({ id: h.id, ad: h.ad }));
  const t = tercih && acik.find(h => h.id === tercih);
  if (t) return { hesap: t, secenekler, not: null };
  if (!acik.length) return { hesap: null, secenekler, not: `Portföyüm'de açık "${HESAP_AD[hesapTuru] || hesapTuru}" hesabı yok — önce Portföy › Kayıt'tan hesap açın (açılış bakiyesiyle).` };
  return { hesap: acik[0], secenekler, not: acik.length > 1 ? `${acik.length} ${HESAP_AD[hesapTuru] || hesapTuru} hesabı var; "${acik[0].ad}" seçildi (Bu ay › Model sermayesi formundan değiştirilebilir).` : null };
}

/** Varsayılan tahmini fiyat: son kapanış (Yahoo dosyası, düzeltilmemiş). → { fiyat, tarih, kaynak } | null */
function sonKapanis(kod) {
  try {
    const V = require('./veri'), h = V.ham(kod), g = h.gunler[h.gunler.length - 1];
    return g ? { fiyat: Math.round(g.c * 1e4) / 1e4, tarih: new Date(g.t).toISOString().slice(0, 10), kaynak: 'son kapanış (Yahoo)' } : null;
  } catch (e) { return null; }
}
function sonUsdtry() {
  try { const V = require('./veri'), u = V.usdtry(); return u.length ? u[u.length - 1].c : null; } catch (e) { return null; }
}

/**
 * Emir listesi. durum: portfoyumDurumu() çıktısı ({ D, deg }). ops:
 *   kesirli (false), minIslemUSD (10), hesap: { hesapTuru: tercih edilen hesap kimliği }, sermaye: { tutar, para } | null,
 *   fiyatBul(kalem) → { fiyat, tarih, kaynak } | null (vars. son kapanış), usdtry (vars. Portföyüm kuru, yoksa veri.js)
 * Döndürür: { model, para, sermaye, hesaplar, satirlar, aktarim, kol837, sapma, esikAlti, nakit, uyarilar, bilgi, uygulanabilir }
 */
function emirListesi(hedef, durum, ops = {}) {
  // B1 (DENETIM-CANLI-PORTFOY): kesirli YALNIZ ABD (USD) hisselerinde — Midas BIST'te kesirli emir almaz.
  const kesirli = ops.kesirli === true && hedef.para === 'USD', minUSD = Number.isFinite(+ops.minIslemUSD) && +ops.minIslemUSD >= 0 ? +ops.minIslemUSD : VARSAYILAN.minIslemUSD;
  const kom = ops.komisyon || VARSAYILAN.komisyon;
  const tamponOran = Number.isFinite(+ops.tamponOran) ? +ops.tamponOran : VARSAYILAN.tamponOran;
  const duzeltmeOran = Number.isFinite(+ops.duzeltmeOran) ? +ops.duzeltmeOran : VARSAYILAN.duzeltmeOran;
  const D = durum.D, deg = durum.deg;
  const usdtry = ops.usdtry || (deg.kur && deg.kur.USDTRY) || sonUsdtry();
  const usd = (t, para) => (para === 'TRY' ? (usdtry ? t / usdtry : null) : t);
  const fiyatBul = ops.fiyatBul || (k => sonKapanis(k.kod));
  const out = { model: hedef.model, ad: hedef.ad, para: hedef.para, kararGunu: hedef.kararGunu, uygulamaGunu: hedef.uygulamaGunu, sermaye: ops.sermaye || null,
    kesirli, minIslemUSD: minUSD, hesaplar: {}, satirlar: [], aktarim: null, kol837: null, sapma: null, esikAlti: [], nakit: {}, uyarilar: [], bilgi: [] };
  const hesapIcin = (tur) => {
    if (out.hesaplar[tur] !== undefined) return out.hesaplar[tur];
    const s = hesapSec(D, tur, ops.hesap && ops.hesap[tur]);
    out.hesaplar[tur] = s.hesap ? { id: s.hesap.id, ad: s.hesap.ad, secenekler: s.secenekler } : { id: null, ad: null, secenekler: s.secenekler, not: s.not };
    if (s.not) (s.hesap ? out.bilgi : out.uyarilar).push(s.not);
    return out.hesaplar[tur];
  };
  if (!ops.sermaye || !(ops.sermaye.tutar > 0)) { out.uyarilar.push('Model sermayesi girilmedi — hedef tutar hesaplanamaz. "Model sermayesi" formundan bu modele ayıracağınız gerçek tutarı girin (yalnız bu bilgisayarda saklanır).'); return out; }
  const sermaye = ops.sermaye.tutar;
  const dz = ops.dondurma && ops.dondurma.hedefAdet ? ops.dondurma : null;
  const poz = (hesapId, sembol, para, kod) => { const ids = varlikEsle(D, sembol, kod, para); return deg.pozisyonlar.filter(p => p.hesap === hesapId && ids.has(p.varlik)).reduce((a, p) => a + p.adet, 0); };
  const varlikBul = (sembol, kod, para) => varlikIlk(D, sembol, kod, para);
  const borsa = hedef.model === 'm-bist-m10' ? 'BIST' : 'NYSE';
  const bayat = new Set();
  const fiyatYasi = (tarih) => { if (!tarih || !ops.bugun) return 0; try { return Math.max(0, T.islemGunleri(tarih, ops.bugun, borsa).length - 1); } catch (e) { return 0; } };
  const satir = (k, h, yon, adet, f, ekler) => {
    const tutar = adet * f.fiyat, v = varlikBul(k.sembol, k.kod, k.para);
    if (fiyatYasi(f.tarih) > 3) bayat.add(`${k.sembol} (${f.tarih})`);
    return { anahtar: `${hedef.model}|${k.sembol}|${yon}`, tur: 'emir', yon, hesapTuru: k.hesapTuru, hesap: h.id, hesapAd: h.ad, sembol: k.sembol, kod: k.kod, ad: k.ad || k.sembol,
      para: k.para, sinif: k.sinif, varlik: v ? v.id : null, adet, fiyat: f.fiyat, fiyatTarih: f.tarih, fiyatKaynak: f.kaynak, tutar: R2(tutar), tutarUSD: usd(tutar, k.para) == null ? null : R2(usd(tutar, k.para)),
      tahminiUcret: ucretTahmini(kom, k.para, tutar),
      uygulanabilir: !!h.id && !bolunmeEksik(v), engel: !h.id ? h.not : bolunmeEksik(v) ? `${k.sembol}: Portföyüm'de bölünme kaydı eksik (adet yanlış) — önce Portföyüm › İşlem ekle › Bölünme girin` : null, ...ekler };
  };
  const yuvarla = (x) => (kesirli ? asagi(x, 6) : Math.floor(x + 1e-9));
  let sapma = 0;
  // B11: Portföyüm "bölünme kaydı eksik" uyarısı olan varlıkta adet yanlış olur → o satır uygulanamaz.
  function bolunmeEksik(v) { return !!(v && (deg.uyarilar || []).some(u => u && u.kod === 'bolunme-eksik' && (u.varlik === v.id || String(u.mesaj || '').startsWith(`${v.sembol}:`)))); }

  if (hedef.model === 'm-837') {
    const kq = hedef.kalemler[0], ku = hedef.hesapHedefleri[0];
    const hA = hesapIcin(kq.hesapTuru), hB = hesapIcin(ku.hesapTuru);
    const f = fiyatBul(kq) || (() => { const p = deg.pozisyonlar.find(x => x.sembol === 'QQQ' && x.fiyat); return p ? { fiyat: p.fiyat, tarih: p.fiyatTarih, kaynak: 'Portföyüm fiyatı' } : null; })();
    if (!f) { out.uyarilar.push('QQQ fiyatı yok — adet hesaplanamadı (fiyatlar ay sonu hazırlığında yenilenir; Veri ekranından güncelleyin).'); return out; }
    const mevcut = hA.id ? poz(hA.id, 'QQQ', 'USD', 'QQQ') : 0;
    const Q = mevcut * f.fiyat;
    const hs = hB.id ? deg.hesaplar.find(x => x.id === hB.id) : null;
    const H = hs ? hs.degerUSD || 0 : 0;
    // B5 (DENETIM-CANLI-PORTFOY): Hücum kolu = Portföyüm'e ELLE girilen Binance bakiyesi; bot işlemleri otomatik gelmez.
    // Son kayıt 3 günden eskiyse bant kontrolü bayat bakiyeyle yapılır → önce Binance bakiyesini güncellemesi istenir.
    if (hs && Number.isFinite(hs.sonKayitGun) && hs.sonKayitGun > 3) out.uyarilar.push(`Binance (Hücum kolu) bakiyesi Portföyüm'de ${hs.sonKayitGun} gün önce güncellendi — bant kontrolü ve aktarım tutarı bayat bakiyeyle hesaplandı. Önce Binance'teki güncel değeri Portföyüm'e girin (USDT = "USD nakit"), sonra listeye yeniden bakın.`);
    const DK = hedef.dengeleme || { kural: 'bant', bantPuan: 0.1 };
    const bant = DK.kural === 'bant' ? DK.bantPuan : null, wU = ku.agirlik, wQ = kq.agirlik;
    // Y3: ilk yerleşim = bu model için iptal edilmemiş tasarımcı kaydı yok (ops.oncekiUygulama false); Binance'teki eski para sayılmaz.
    const ilk = ops.oncekiUygulama === undefined ? Q + H < 1 : !ops.oncekiUygulama;
    const pay = ilk || Q + H < 1 ? null : H / (Q + H);
    const disi = ilk || pay == null || bant == null || pay < wU - bant || pay > wU + bant;
    out.kol837 = { cekirdekUSD: R2(Q), uyduUSD: R2(H), toplamUSD: R2(Q + H), hucumPay: pay, bant: bant == null ? null : [wU - bant, wU + bant], disi, ilk, qqqAdet: mevcut, fiyat: f.fiyat, fiyatTarih: f.tarih,
      kural: bant == null ? 'ay sonu 50/50' : `bant ±${Math.round(bant * 100)} puan (Hücum %${Math.round((wU - bant) * 100)}–%${Math.round((wU + bant) * 100)})` };
    if (!disi) {
      out.bilgi.push(`Hücum payı %${(pay * 100).toFixed(1).replace('.', ',')} — bant içinde (%${Math.round((wU - bant) * 100)}–%${Math.round((wU + bant) * 100)}): bu ay QQQ işlemi ve hesaplar arası aktarım YOK.`);
      if (Math.abs(Q + H - sermaye) / sermaye > 0.1) out.bilgi.push(`837 toplamı ${R2(Q + H).toLocaleString('tr-TR')} $, girilen sermaye ${sermaye.toLocaleString('tr-TR')} $ — bant kuralı sermayeyi değil güncel toplamı dengeler; ek para yatırdıysanız Portföyüm'e kaydedin.`);
      out.sapma = { toplam: 0, oran: 0, para: 'USD' };
      return bitir(out);
    }
    const taban = ilk ? sermaye : Q + H;
    if (ilk && H >= 1) out.bilgi.push(`Binance hesabında şimdiden ${R2(H).toLocaleString('tr-TR')} $ var — ilk yerleşimde modele SAYILMADI (aktarım sermayenin %${Math.round(wU * 100)}'i). Modele dahil edilsin isterseniz Uyguladım formunda aktarım tutarını ${R2(Math.max(0, sermaye * wU - H)).toLocaleString('tr-TR')} $ olarak düzeltin.`);
    if (!ilk && Math.abs(Q + H - sermaye) / sermaye > 0.1) out.uyarilar.push(`837 güncel toplamı ${R2(Q + H).toLocaleString('tr-TR')} $, girilen sermaye ${sermaye.toLocaleString('tr-TR')} $ (fark %${(Math.abs(Q + H - sermaye) / sermaye * 100).toFixed(0)}) — bant kuralı güncel toplamı 50/50'ye böler; sermayeyi güncelleyin ya da ek parayı Portföyüm'e kaydedin.`);
    // B2: QQQ alışı için komisyon + açılış tamponu ayrılır (aktarım sonrası ABD nakdi eksiye düşmesin).
    const hedefQ = Math.max(0, taban * wQ * (1 - tamponOran) - ucretTahmini(kom, 'USD', taban * wQ)), hedefH = taban * wU;
    const hAdet = yuvarla(hedefQ / f.fiyat), fark = kesirli ? asagi(hAdet - mevcut, 6) : hAdet - mevcut;
    const neden = ilk ? 'ilk yerleşim — çekirdek %50' : `bant aşıldı (Hücum %${(pay * 100).toFixed(1).replace('.', ',')}) — tam 50/50`;
    sapma = hedefQ - hAdet * f.fiyat;
    if (Math.abs(fark) * f.fiyat >= Math.max(minUSD, EPS) && Math.abs(fark) > EPS) out.satirlar.push(satir(kq, hA, fark > 0 ? 'al' : 'sat', Math.abs(fark), f, { mevcutAdet: mevcut, hedefAdet: hAdet, hedefTutar: R2(hedefQ), kol: 'cekirdek', neden }));
    else if (Math.abs(fark) > EPS) out.esikAlti.push({ sembol: 'QQQ', adet: fark, tutar: R2(fark * f.fiyat) });
    const akt = hedefH - (ilk ? 0 : H);
    if (Math.abs(akt) >= Math.max(minUSD, 1)) {
      const ab = akt > 0;   // true: ABD → Binance
      out.aktarim = { anahtar: `${hedef.model}|aktarim`, tur: 'aktarim', yon: ab ? 'abd→binance' : 'binance→abd', hesap: ab ? hA.id : hB.id, hesapAd: ab ? hA.ad : hB.ad, hedefHesap: ab ? hB.id : hA.id, hedefHesapAd: ab ? hB.ad : hA.ad,
        para: 'USD', tutar: R2(Math.abs(akt)), tutarUSD: R2(Math.abs(akt)), mevcutTutar: R2(H), hedefTutar: R2(hedefH), kol: 'uydu',
        neden: ilk ? 'ilk yerleşim — Hücum kolu %50 (Binance hesabına)' : `bant aşıldı — Hücum kolunu %50'ye ${ab ? 'tamamla' : 'indir'}`,
        uygulanabilir: !!(hA.id && hB.id), engel: hA.id && hB.id ? null : (hA.not || hB.not),
        not: ab ? 'Parayı ABD hesabından Binance\'e aktarın (banka üzerinden); Hücum botu Binance\'te kendi işini yapar.' : 'Hücum kolundan (Binance) bu tutarı çekip ABD hesabına aktarın; QQQ alımı bundan sonra.' };
      // O6: Binance → ABD aktarımı Binance'teki USD NAKDİNDEN çıkar; kripto satışı girilmeden yazılırsa nakit eksiye düşer.
      if (!ab && hB.id) {
        const bn = deg.nakitler.filter(x => x.hesap === hB.id && x.para === 'USD').reduce((a, x) => a + x.tutar, 0);
        if (bn + 0.01 < out.aktarim.tutar) {
          out.aktarim.uygulanabilir = false;
          out.aktarim.engel = `Binance USD nakdi ${R2(bn).toLocaleString('tr-TR')} $ — önce Hücum kolundaki kripto satışını Portföyüm'e "Satış" olarak girin, sonra aktarımı kaydedin`;
          out.uyarilar.push(`Aktarım (Binance → ABD): ${out.aktarim.engel}.`);
        }
      }
    }
    // B6 (62.2): aktarım ile QQQ işleminin zamanlaması — para yolda 1–3 iş günü kalabilir (banka / kur / P2P; gerçek süre kullanıcı ölçecek).
    if (out.aktarim) {
      const qAl = out.satirlar.find(x => x.sembol === 'QQQ' && x.yon === 'al');
      const qSat = out.satirlar.find(x => x.sembol === 'QQQ' && x.yon === 'sat');
      if (out.aktarim.yon === 'binance→abd' && qAl) {
        qAl.aktarimBekler = true;
        qAl.neden = `${qAl.neden} · aktarım ABD hesabına ULAŞINCA al`;
        out.bilgi.push('Sıra: önce Binance\'ten ABD hesabına aktarım; QQQ alışını para ABD hesabına ULAŞINCA yapın (1–3 iş günü sürebilir). Uyguladım\'da aktarımı ve alışı ayrı günlerde işaretleyebilirsiniz; aktarımda "ulaşan" tutarı yazın (masraf düşülmüş).');
      } else if (out.aktarim.yon === 'abd→binance' && qSat) {
        out.bilgi.push('Sıra: önce QQQ satışı; satışın parası ABD\'de ertesi iş günü (T+1) çekilebilir — aktarımı ondan sonra yapın. Uyguladım\'da aktarımda "ulaşan" tutarı (Binance\'e geçen USDT) yazın.');
      } else {
        out.bilgi.push('Aktarımda Uyguladım\'a gönderilen ve hedefe ULAŞAN tutarı ayrı yazın — fark (banka/kur/P2P masrafı) Portföyüm\'de masraf olarak düşer.');
      }
    }
    if (!ilk) out.bilgi.push('Bant aşıldı: model bu QQQ işlem günü KAPANIŞINDA dengeler. Gerçek hesapta bugün kapanışa yakın ya da en geç ertesi açılışta uygulayın — ertesi güne kaymak ölçümde sonucu çok az değiştirdi; kuralın asıl yararı az aktarım (8 yılda 105 yerine 13).');
    out.sapma = { toplam: R2(sapma), oran: sapma / taban, para: 'USD' };
    return bitir(out);
  }

  // ── M10 (Nasdaq / BIST): hedef listesi + önceki liste
  const tur = KALEM[hedef.model].hesapTuru, h = hesapIcin(tur), para = hedef.para;
  const hedefSet = new Set(hedef.kalemler.map(k => k.sembol)), onceki = new Set(hedef.onceki || []);
  const satislar = [], alislar = [], pahali = [];
  // B10: bu modelin iptal edilmemiş tasarımcı kayıtlarından net adet (sembol → adet); kayıt yoksa (ilk ay) null.
  const modelAdet = ops.modelAdet || null;
  // Listeden çıkanlar: hesapta olup önceki listede bulunan ama yeni listede olmayan semboller.
  if (h.id) {
    for (const s of onceki) {
      if (hedefSet.has(s)) continue;
      const k = { sembol: s, kod: KALEM[hedef.model].kod(s), para, sinif: KALEM[hedef.model].sinif, hesapTuru: tur, ad: s };
      const m = poz(h.id, s, para, k.kod);
      if (m > EPS && modelAdet && modelAdet.has(s) && m > modelAdet.get(s) + EPS) out.uyarilar.push(`${s}: hesapta modelin ${modelAdet.get(s)} adedinden fazla (${m}) var — liste tamamını satar; fazlası kişiselse satış adedini Uyguladım formunda ${modelAdet.get(s)} yapın.`);
      if (m > EPS) {
        const ids = varlikEsle(D, s, k.kod, para);
        const f = fiyatBul(k) || { fiyat: (deg.pozisyonlar.find(p => p.hesap === h.id && ids.has(p.varlik)) || {}).fiyat, tarih: null, kaynak: 'Portföyüm fiyatı' };
        if (!(f.fiyat > 0)) { out.uyarilar.push(`${s}: fiyat yok — satış tutarı hesaplanamadı (adet ${m} — tamamını satın).`); f.fiyat = 0; }
        satislar.push(satir(k, h, 'sat', m, f, { mevcutAdet: m, hedefAdet: 0, hedefTutar: 0, neden: 'listeden çıktı — tamamını sat' }));
      }
    }
  }
  const aday = { hedefAdet: {}, fiyat: {}, taban: sermaye };
  let gercekDeger = 0;
  for (const s of new Set([...hedefSet, ...onceki])) {
    if (!h.id) break;
    const k0 = { sembol: s, kod: KALEM[hedef.model].kod(s) }, m0 = poz(h.id, s, para, k0.kod);
    if (m0 > EPS) { const f0 = fiyatBul(k0); if (f0 && f0.fiyat > 0) gercekDeger += m0 * f0.fiyat; }
  }
  // Önce her kalemin hedef adedi (⌊⌋), sonra Ö12 "en büyük kalan": kalan nakitle kesir payı en büyük hisselere birer adet daha.
  const kalemler = [];
  // B2: alışa ayrılan taban = hedef taban − açılış tamponu − tahmini komisyon (her hedef + çıkan hisse için bir emir).
  const emirSay = hedef.kalemler.length + [...onceki].filter(s => !hedefSet.has(s)).length;
  const kullanilir = Math.max(0, sermaye * (1 - tamponOran) - emirSay * ucretTahmini(kom, para, sermaye / Math.max(1, hedef.kalemler.length)));
  for (const k of hedef.kalemler) {
    const fCanli = fiyatBul(k);
    const ht = kullanilir * k.agirlik;
    // Dondurulmuş hedef (O3): adet ve fiyat ayın ilk uygulamasındaki değer.
    const f = dz && dz.fiyat && dz.fiyat[k.sembol] > 0 ? { fiyat: dz.fiyat[k.sembol], tarih: dz.fiyatTarih && dz.fiyatTarih[k.sembol] || null, kaynak: 'dondurulmuş (ayın ilk uygulaması)' } : fCanli;
    if (!f || !(f.fiyat > 0)) { out.uyarilar.push(`${k.sembol}: fiyat yok — adet hesaplanamadı (hedef ${paraYaz(ht, para)}).`); sapma += ht; continue; }
    const donmus = !!(dz && dz.hedefAdet[k.sembol] != null);
    kalemler.push({ k, f, ht, donmus, hAdet: donmus ? dz.hedefAdet[k.sembol] : yuvarla(ht / f.fiyat), ek: false });
  }
  const yuvarlama = enBuyukKalan(kalemler.filter(x => !x.donmus && !kesirli), kalemler.reduce((a, x) => a + x.ht - x.hAdet * x.f.fiyat, 0));
  if (yuvarlama.length) out.bilgi.push(`Tam adet yuvarlaması (en büyük kalan): kalan nakitle ${yuvarlama.join(', ')} için birer adet daha alındı — nakit modele en yakın kalır.`);
  for (const x of kalemler) {
    const { k, f, ht, hAdet } = x;
    const m = h.id ? poz(h.id, k.sembol, para, k.kod) : 0;
    const fark = kesirli ? asagi(hAdet - m, 6) : hAdet - m;
    aday.hedefAdet[k.sembol] = hAdet; aday.fiyat[k.sembol] = f.fiyat; (aday.fiyatTarih = aday.fiyatTarih || {})[k.sembol] = f.tarih || null;
    sapma += ht - hAdet * f.fiyat;
    const neden0 = hedef.ilk && !onceki.size ? 'ilk yerleşim — listeye girdi' : !onceki.has(k.sembol) ? 'listeye girdi' : m > EPS ? `listede kaldı — %${Math.round(k.agirlik * 100)} ağırlığa dengeleme` : 'listede (elde yok) — al';
    const neden = x.ek ? `${neden0} · +1 adet (en büyük kalan yuvarlaması)` : neden0;
    if (hAdet <= EPS && ht > 0 && m <= EPS) pahali.push(k.sembol);
    if (Math.abs(fark) <= EPS) continue;
    const tutarUSD = usd(Math.abs(fark) * f.fiyat, para);
    if (tutarUSD != null && tutarUSD < minUSD) { out.esikAlti.push({ sembol: k.sembol, adet: fark, tutar: R2(fark * f.fiyat) }); continue; }
    // B8: listede KALAN hissede ağırlık düzeltmesi yalnız fark ≥ taban × %2 ise (giriş / çıkış her zaman yapılır).
    if (m > EPS && hAdet > EPS && onceki.has(k.sembol) && !x.donmus && Math.abs(fark) * f.fiyat < duzeltmeOran * sermaye) { out.esikAlti.push({ sembol: k.sembol, adet: fark, tutar: R2(fark * f.fiyat), neden: `düzeltme %${Math.round(duzeltmeOran * 100)} eşiğinin altında` }); continue; }
    (fark > 0 ? alislar : satislar).push(satir(k, h, fark > 0 ? 'al' : 'sat', Math.abs(fark), f, { mevcutAdet: m, hedefAdet: hAdet, hedefTutar: R2(ht), neden }));
  }
  out.satirlar = [...satislar, ...alislar];
  if (pahali.length) out.uyarilar.push(`${pahali.join(', ')}: tek hissenin fiyatı hedef tutardan (${paraYaz(sermaye * hedef.kalemler[0].agirlik, para)}) yüksek — tam adetle alınamıyor, payı nakitte kalır. Sermayeyi artırın ya da Midas'ta kesirli alımı doğrulayıp ayarı açın.`);
  out.sapma = { toplam: R2(sapma), oran: sapma / sermaye, para };
  out.dondurmaAday = dz || aday;
  out.dondurulmus = !!dz;
  if (dz) out.bilgi.push('Bu ayın hedef adetleri ilk "Uyguladım" ile donduruldu — ay içi fiyat oynaması yeni satır açmaz (tahmini fiyat da dondurulmuş).');
  if (gercekDeger > 0 && Math.abs(gercekDeger - sermaye) / sermaye > 0.05) out.uyarilar.push(`Gerçek pozisyon değeri ${paraYaz(gercekDeger, para)}, model değeri (hedef tabanı) ${paraYaz(sermaye, para)} — fark ${gercekDeger < sermaye ? '−' : '+'}%${(Math.abs(gercekDeger / sermaye - 1) * 100).toFixed(1).replace('.', ',')} (uygulama farkı; liste farkı kapatır).`);
  return bitir(out);

  function bitir(o) {
    // Nakit denetimi (model para biriminde): hesap nakdi + satış − alış ± aktarım — tek yuvarlama kuralı (nakitSonra, D5).
    const kalem = nakitKalemleri([...o.satirlar.map(s => ({ yon: s.yon, hesap: s.hesap, tutar: s.tutar, ucret: s.tahminiUcret || 0 })), ...(o.aktarim ? [{ tur: 'aktarim', hesap: o.aktarim.hesap, hedefHesap: o.aktarim.hedefHesap, tutar: o.aktarim.tutar }] : [])]);
    const ucretToplam = R2(o.satirlar.reduce((a, s) => a + (s.tahminiUcret || 0), 0));
    o.ucretTahmini = ucretToplam;
    if (o.satirlar.length) {
      const islemTutari = o.satirlar.reduce((a, s) => a + (s.tutar || 0), 0);
      o.bilgi.push(ucretToplam > 0 ? `Tahmini komisyon: ${o.satirlar.length} emir × ${paraYaz(o.satirlar[0].tahminiUcret, o.para)} = ${paraYaz(ucretToplam, o.para)} (işlem tutarının %${(islemTutari > 0 ? ucretToplam / islemTutari * 100 : 0).toFixed(1).replace('.', ',')}'i) — nakit hesabına dahil; Uyguladım formunda ücret alanı bu tutarla dolu gelir.` : `Komisyon yok (Midas ${o.para === 'TRY' ? 'BIST' : ''}).`);
    }
    for (const [hid, kl] of kalem) {
      const n = deg.nakitler.filter(x => x.hesap === hid && x.para === o.para).reduce((a, x) => a + x.tutar, 0);
      const hs = D.hesaplar.get(hid);
      const sonra = nakitSonra(n, kl);
      o.nakit[hid] = { mevcut: R2(n), sonra, para: o.para, hesapAd: hs ? hs.ad : hid };
      if (sonra < -0.01 && !(hs && hs.hesapTuru === 'binance')) o.uyarilar.push(`${hs ? hs.ad : hid}: nakit yetersiz — emirlerden sonra ${paraYaz(sonra, o.para)} (önce para yatırın ya da aktarın; Portföyüm'e "Para yatırma" kaydı girin).`);
    }
    if (o.sapma && o.sapma.oran > 0.005 + tamponOran) o.uyarilar.push(`${o.kesirli ? 'Kesirli adetle' : 'Tam adet alındığı için (kesirli hisse alınmaz)'} ${paraYaz(o.sapma.toplam, o.sapma.para)} (%${(o.sapma.oran * 100).toFixed(1).replace('.', ',')}) nakitte kalır (içinde %${(tamponOran * 100).toLocaleString('tr-TR')} açılış tamponu ve komisyon payı var).`);
    if (bayat.size) o.uyarilar.push(`Bayat fiyat (3 işlem gününden eski son kapanış): ${[...bayat].join(', ')} — adetleri aracı kurumdaki güncel fiyatla kontrol edin.`);
    o.uygulanabilir = [...o.satirlar, ...(o.aktarim ? [o.aktarim] : [])].some(s => s.uygulanabilir);
    return o;
  }
}

/** Portföyüm'de bu ay + model için İPTAL EDİLMEMİŞ "Uyguladım" kayıtları → Map anahtar → [{ id, uygulama, zaman }]. */
function uygulamaAnahtarlari(kayitlar, D, { ay, model }) {
  const m = new Map();
  for (const k of kayitlar || []) {
    if (k.tur !== 'islem' || !k.tasarimci || k.tasarimci.ay !== ay || (model && k.tasarimci.model !== model)) continue;
    if (D.iptalEdilen.has(k.id)) continue;
    const a = k.tasarimci.anahtar;
    if (!m.has(a)) m.set(a, []);
    m.get(a).push({ id: k.id, uygulama: k.tasarimci.uygulama, zaman: k.zaman, model: k.tasarimci.model, islem: k.islem, adet: k.adet, fiyat: k.fiyat, tutar: k.tutar, tarih: k.tarih, varlik: k.varlik, hesap: k.hesap });
  }
  return m;
}
/** Uygulama kimliği başına özet (panel "uygulananlar" listesi). */
function uygulamaOzetleri(anahtarlar) {
  const u = new Map();
  for (const [a, l] of anahtarlar) for (const x of l) {
    if (!u.has(x.uygulama)) u.set(x.uygulama, { uygulama: x.uygulama, model: x.model, zaman: x.zaman, tarih: x.tarih, kayitlar: [], anahtarlar: [] });
    const o = u.get(x.uygulama); o.kayitlar.push(x.id); if (!o.anahtarlar.includes(a)) o.anahtarlar.push(a);
  }
  return [...u.values()].sort((a, b) => (a.zaman < b.zaman ? -1 : 1));
}

function sayiAl(x, ad, hatalar, { sifirOlur = false, bos = null } = {}) {
  if (x === '' || x == null) return bos;
  const c = require('../portfoyum/model').sayiCoz(x);
  if (c.hata) { hatalar.push(`${ad}: ${c.hata}`); return NaN; }
  if (!(sifirOlur ? c.deger >= 0 : c.deger > 0)) { hatalar.push(`${ad} ${sifirOlur ? '0 ya da pozitif' : 'pozitif'} olmalı`); return NaN; }
  return c.deger;
}

/** Benzersiz varlık kimliği (depo kimlikleri v<n>; tasarımcı vt-<SEMBOL>-<PARA>). */
function varlikKimligi(D, sembol, para, kullanilan) {
  const temel = `vt-${sembol}-${para}`.replace(/[^A-Za-z0-9.\-_]/g, '_');
  let id = temel, n = 2;
  while (kullanilan.has(id)) id = `${temel}-${n++}`;
  kullanilan.add(id);
  return id;
}

/**
 * Düzenlenmiş satırlar → Portföyüm kayıt nesneleri (tek atomik paket: önce yeni varlıklar, sonra işlemler).
 * satirlar: emirListesi satırları + kullanıcı düzeltmesi (adet, fiyat, ucret; aktarımda tutar). Her işlem `kaynakKayit:'tasarimci'`
 * ve `tasarimci: { ay, model, anahtar, uygulama }` taşır. Denetim (bilinmeyen hesap, negatif adet…) çağıranın depo.ekle'sinde.
 */
function uygulaKayitlari(satirlar, { D, ay, model, tarih, uygulama }) {
  const hatalar = [], kayitlar = [], yeniVarliklar = [], islemler = [];
  const kullanilan = new Set((D.tumKayitlar || []).map(k => k.id).filter(Boolean));
  const yeniV = new Map();
  // Ö10 (61.1): acilisSonrasi YALNIZ o gün o hesapta gerçekten açılış varsa yazılır (anlamı: açılıştan sonra yapıldı);
  // gün içi sıra ayrı alanda (gunIciSira: satış 100+, aktarım 200+, alış 300+ — paket sırası).
  const acilisGunu = (hesap) => !!hesap && (D.islemler || []).some(x => x.islem === 'acilis' && x.hesap === hesap && x.tarih === tarih);
  for (const s of satirlar || []) {
    const ad = s.sembol || s.anahtar;
    const meta = { ay, model, anahtar: s.anahtar, uygulama };
    if (s.tur === 'aktarim') {
      const tutar = sayiAl(s.tutar, `${ad} aktarım tutarı`, hatalar);
      if (!s.hesap || !s.hedefHesap) { hatalar.push('aktarım: kaynak ya da hedef hesap yok'); continue; }
      if (!Number.isFinite(tutar)) continue;
      const x = { tur: 'islem', islem: 'transfer', tarih, hesap: s.hesap, hedefHesap: s.hedefHesap, para: s.para || 'USD', tutar, not: `Tasarımcı ${ay} ${model} — ${s.neden || 'aktarım'}`.slice(0, 500), kaynakKayit: 'tasarimci', tasarimci: meta };
      // B6 (62.2): ulaşan tutar (boş = gönderilen); fark Portföyüm'de masraf (portfoyum/muhasebe transfer).
      if (s.ulasanTutar != null && s.ulasanTutar !== '') { const u = sayiAl(s.ulasanTutar, `${ad} ulaşan tutar`, hatalar); if (Number.isFinite(u)) x.ulasanTutar = u; }
      if (acilisGunu(s.hesap) || acilisGunu(s.hedefHesap)) x.acilisSonrasi = true;
      islemler.push(x);
      continue;
    }
    if (s.yon !== 'al' && s.yon !== 'sat') { hatalar.push(`${ad}: yön al/sat olmalı`); continue; }
    if (!s.hesap) { hatalar.push(`${ad}: hesap yok (${s.engel || 'Portföyüm\'de hesap açın'})`); continue; }
    const adet = sayiAl(s.adet, `${ad} adet`, hatalar), fiyat = sayiAl(s.fiyat, `${ad} fiyat`, hatalar, { sifirOlur: true }), ucret = sayiAl(s.ucret, `${ad} ücret`, hatalar, { sifirOlur: true });
    if (![adet, fiyat].every(Number.isFinite) || Number.isNaN(ucret)) continue;
    let varlik = s.varlik && D.varliklar.has(s.varlik) ? s.varlik : null;
    if (!varlik) { const v = varlikIlk(D, s.sembol, s.kod, s.para); if (v) varlik = v.id; }
    if (!varlik) {
      const anah = `${s.sembol}|${s.para}`;
      if (!yeniV.has(anah)) {
        const id = varlikKimligi(D, s.sembol, s.para, kullanilan);
        const vk = { id, tur: 'varlik', sembol: String(s.sembol).toUpperCase(), ad: s.ad && s.ad !== s.sembol ? s.ad : s.sembol, sinif: s.sinif || 'hisse', para: s.para, kaynak: 'yahoo', kod: s.kod || s.sembol, kaynakKayit: 'tasarimci' };
        yeniV.set(anah, vk); yeniVarliklar.push(vk);
      }
      varlik = yeniV.get(anah).id;
    }
    const x = { tur: 'islem', islem: s.yon, tarih, hesap: s.hesap, varlik, adet, fiyat, ...(ucret ? { ucret } : {}), not: `Tasarımcı ${ay} ${model} — ${s.neden || ''}`.slice(0, 500), kaynakKayit: 'tasarimci', tasarimci: meta };
    if (acilisGunu(s.hesap)) x.acilisSonrasi = true;
    islemler.push(x);
  }
  const sira = { sat: 0, transfer: 1, al: 2 };
  islemler.sort((a, b) => sira[a.islem] - sira[b.islem]);
  // Gün içi sıra: önce satış, sonra aktarım, sonra alış (muhasebe.js siralaIslemler; satışın nakdi alıştan önce sayılır).
  const taban = { sat: 100, transfer: 200, al: 300 }, n = { sat: 0, transfer: 0, al: 0 };
  for (const x of islemler) x.gunIciSira = taban[x.islem] + Math.min(99, n[x.islem]++);
  kayitlar.push(...yeniVarliklar, ...islemler);
  return { kayitlar, yeniVarliklar, hatalar };
}

/**
 * Portföyüm hedef kaydı (tur:'hedef') — modellerin sermayesiyle ağırlıklı, YALNIZ model kalemlerini kapsar (toplam %100).
 * listeler: [{ hedef (hedefGenislet), sermaye: { tutar, para } }] · duzey: 'sinif' | 'varlik'
 */
function hedefKaydi(listeler, { D, deg, duzey = 'sinif', usdtry, bant = 5, ay = '' }) {
  const hatalar = [], yeniVarliklar = [], parca = new Map(), dokum = [];
  const kullanilan = new Set((D.tumKayitlar || []).map(k => k.id).filter(Boolean));
  const usd = (t, para) => (para === 'TRY' ? (usdtry ? t / usdtry : NaN) : t);
  const ekle = (anah, w, ad) => { parca.set(anah, (parca.get(anah) || 0) + w); dokum.push({ anahtar: anah, ad, usd: R2(w) }); };
  const modeller = [];
  for (const { hedef, sermaye } of listeler) {
    if (!sermaye || !(sermaye.tutar > 0)) continue;
    const S = usd(sermaye.tutar, sermaye.para);
    if (!Number.isFinite(S)) { hatalar.push(`${hedef.ad}: USD/TRY kuru yok`); continue; }
    modeller.push(hedef.model);
    for (const k of hedef.kalemler) {
      if (duzey === 'sinif') { ekle(k.sinif, S * k.agirlik, `${k.sembol} (${hedef.ad})`); continue; }
      let v = varlikIlk(D, k.sembol, k.kod, k.para);
      if (!v) {
        const ex = yeniVarliklar.find(y => y.sembol === k.sembol && y.para === k.para);
        v = ex || { id: varlikKimligi(D, k.sembol, k.para, kullanilan), tur: 'varlik', sembol: k.sembol, ad: k.ad || k.sembol, sinif: k.sinif, para: k.para, kaynak: 'yahoo', kod: k.kod, kaynakKayit: 'tasarimci' };
        if (!ex) yeniVarliklar.push(v);
      }
      ekle(v.id, S * k.agirlik, `${k.sembol} (${hedef.ad})`);
    }
    for (const hh of hedef.hesapHedefleri) {
      const w = S * hh.agirlik;
      if (duzey === 'sinif') { ekle('kripto', w, `Hücum kolu (${hedef.ad})`); continue; }
      const hs = [...D.hesaplar.values()].find(x => x.hesapTuru === hh.hesapTuru && x.durum === 'acik');
      const icerik = hs ? [...deg.pozisyonlar.filter(p => p.hesap === hs.id && p.degerUSD > 0).map(p => [p.varlik, p.degerUSD]), ...deg.nakitler.filter(n => n.hesap === hs.id && n.degerUSD > 0).map(n => ['nakit:' + n.para, n.degerUSD])] : [];
      const top = icerik.reduce((a, [, x]) => a + x, 0);
      if (!(top > 0)) { hatalar.push('Hücum kolu varlık düzeyinde eşlenemiyor (Binance hesabı yok ya da boş) — sınıf düzeyini seçin'); continue; }
      for (const [a, x] of icerik) ekle(a, w * x / top, `Hücum kolu (${hedef.ad})`);
    }
  }
  const top = [...parca.values()].reduce((a, x) => a + x, 0);
  if (!(top > 0)) { hatalar.push('Sermayesi girilmiş model yok — önce "Model sermayesi" formunu doldurun'); return { kayit: null, yeniVarliklar: [], dokum, hatalar }; }
  const agirliklar = {};
  const anah = [...parca.keys()];
  for (const a of anah) agirliklar[a] = Math.round(parca.get(a) / top * 10000) / 100;
  const fark = Math.round((100 - Object.values(agirliklar).reduce((a, x) => a + x, 0)) * 100) / 100;
  if (fark) { const enB = anah.reduce((m, a) => (agirliklar[a] > agirliklar[m] ? a : m), anah[0]); agirliklar[enB] = Math.round((agirliklar[enB] + fark) * 100) / 100; }
  const kayit = { tur: 'hedef', duzey, agirliklar, bant, kaynak: `tasarimci ${ay} (${modeller.join(', ')})`.slice(0, 120), kaynakKayit: 'tasarimci' };
  return { kayit, yeniVarliklar, dokum, hatalar };
}

const imza = (x) => DF.sha(x);

module.exports = { KALEM, VARSAYILAN, ucretTahmini, HESAP_AD, varlikEsle, varlikIlk, hedefGenislet, portfoyumDurumu, hesapSec, sonKapanis, emirListesi, uygulamaAnahtarlari, uygulamaOzetleri, uygulaKayitlari, hedefKaydi, imza, paraYaz, enBuyukKalan, nakitKalemleri, nakitSonra, _ic: { asagi, varlikKimligi, path } };
