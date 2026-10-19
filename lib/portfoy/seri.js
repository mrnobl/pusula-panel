/**
 * PORTFÖY KARAR MOTORU — TEK TİP GETİRİ SERİSİ (L1). Katalogdaki her varlık → [{t, getiri}] (USD | TL | TL-reel).
 * Öz test: node scripts/portfoy-katalog-selftest.js
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * API
 * ═══════════════════════════════════════════════════════════════════════════
 *   seri(kimlik, ops)        → [{ t, getiri }]   (t = UTC gece yarısı ms; aylıkta t = ayın 1'i ve ek alan `ay`)
 *   seriPaket(kimlik, ops)   → { kimlik, birim, siklik, satirlar: [{t, getiri}], baslangic ('YYYY-MM-DD' taban/ilk seviye günü),
 *                                bitis, seviyeSonu, notlar: [..], varlik }
 *   matris(kimlikler, ops)   → { takvim: [t], getiri: { kimlik: Float64Array }, baslangic: {kimlik: 'YYYY-MM-DD'}, bas, bit, birim, siklik }
 *        Ortak takvim (günlük: Pzt–Cum; aylık: ay başları) [en erken taban, ops.bitis='ortak' → kolların ORTAK son günü |
 *        'en-gec' → en geç son gün]. Serinin olmadığı günler NaN (portfoyOpt.walkForward girdisiyle aynı biçim:
 *        getiri[k][d] = takvim[d] günündeki getiri). Kimlik yerine { kimlik, senaryo?, tefasHizalama? } nesnesi de verilebilir;
 *        anahtar o zaman 'kimlik#senaryo'.
 *   tufeAylik()              → [{ ay:'YYYY-MM', t (ay SONU günü), deger }]  TÜİK TÜFE 2025=100 (EVDS TP.TUKFIY2025.GENEL)
 *   kurUSD(para)             → [{t, c}] 1 birim paranın USD değeri | null (kur serisi yok)
 *   onbellekTemizle()
 *
 * ops: { birim: 'USD' (vars.) | 'TL' | 'TL-reel', siklik: 'gunluk' (vars.) | 'aylik', kismiAy?: false,
 *        tefasHizalama?: 'degerleme' (vars.) | 'islem', senaryo?: 'i'|'ii'|'iii' (yalnız strateji:hucum / strateji:denge),
 *        bas?: 'YYYY-MM-DD', bit?: 'YYYY-MM-DD' (sonuç satırlarını süzer; hesap tüm seri üzerinde) }
 *
 * HİZALAMA KURALLARI (portfoyVeri.kolSerileri ile BİREBİR; öz test 5+ kolda eşitliği doğrular)
 *   1. Yerel seviye satırları (kaynaklar.js) → birim dönüşümü SATIR GÜNÜNDE: kur = o gün ya da öncesindeki son kapanış
 *      (portfoyVeri.kurlu). TRY → USD: / USDTRY. Diğer para → USD: × kurUSD(para). USD → TL: × USDTRY.
 *      Dönüşümlü serinin son günü kurun son günüyle sınırlanır (bilinmeyen kur ileri taşınmaz).
 *   2. TL-reel: TL seviye / TÜFE(t). TÜFE ay M değeri ayın SON gününe yazılır, aradaki günler geometrik ara değer (aylık
 *      reel getiri = nominal / (TÜFE_M / TÜFE_{M−1}) ile tutarlı). İlk TÜFE ayından önce ve son TÜFE ayının son gününden sonra
 *      TL-reel değer YOK (uydurulmaz) → seri orada biter (TÜFE ~ayın 3'ünde yayımlanır).
 *   3. Takvim: Pzt–Cum, [ilk seviye günü, son seviye günü]; her gün son bilinen seviye (ileri taşıma). Hafta sonu (kripto,
 *      mevduat, strateji) hareketi Pazartesiye bileşik eklenir; tatilde 0 getiri. getiri(d) = L(d)/L(d−1) − 1; ilk gün yazılmaz.
 *   4. Aylık: ay sonu = takvimde ayın son Pzt–Cum günü; t = ayın 1'i; tamamlanmamış son ay atlanır (kismiAy: true ile dahil).
 *   5. TEFAS: tefasHizalama 'degerleme' (vars.): D tarihli fiyat önceki fiyat gününe yazılır (fiyat bir önceki günün piyasa
 *      kapanışından hesaplanır — portfoyVeri başlığında ölçüm). Bu kural TL ve TL-reel birimde de uygulanır.
 */
const O = require('./ortak');
const K = require('./kaynaklar');
const KAT = require('./katalog');
const { GUN, tStr, tarihT, ayAnahtar } = O;

const pv = () => require('../research/portfoyVeri');
const _bellek = new O.Bellek(300);
let _tufe = null;

const BIRIMLER = ['USD', 'TL', 'TL-reel'];

// ── Kur ve TÜFE ──────────────────────────────────────────────────────────────
/** 1 birim `para`nın USD değeri [{t, c}] ya da null. */
function kurUSD(para) {
  if (para === 'USD') return null;
  if (para === 'TRY') return pv().usdtry().map(x => ({ t: x.t, c: 1 / x.c }));
  const dogrudan = K.yahooBul(para + 'USD=X');           // EURUSD=X: 1 EUR = c USD
  if (dogrudan) return K.yahooDosyaOku(dogrudan.dosya).satirlar.map(x => ({ t: x.t, c: x.v }));
  const ters = K.yahooBul(para + '=X');                  // JPY=X: 1 USD = c JPY
  if (ters) return K.yahooDosyaOku(ters.dosya).satirlar.map(x => ({ t: x.t, c: 1 / x.v }));
  return null;
}

/** satirlar [{t,v}] × kur [{t,c}] (satır gününde son bilinen kur); kurun son gününden sonrası atılır. */
function kurla(satirlar, kur, bol) {
  const out = [];
  let j = 0, son = NaN;
  const kurSon = kur[kur.length - 1].t;
  for (const x of satirlar) {
    if (x.t > kurSon) break;
    while (j < kur.length && kur[j].t <= x.t) { son = kur[j].c; j++; }
    if (son > 0) out.push({ t: x.t, v: bol ? x.v / son : x.v * son });
  }
  return out;
}

function tufeAylik() {
  const p = O.yollar().tufe, im = O.imza(p);
  if (_tufe && _tufe.im === im) return _tufe.x;
  if (!im) throw new Error("seri: TÜFE verisi yok (data/portfoy/tufe.json) — require('lib/portfoy/indir').tufeIndir()");
  const j = O.jsonOku(p);
  const x = j.aylik.filter(a => a.deger > 0).map(a => {
    const y = +a.ay.slice(0, 4), m = +a.ay.slice(5, 7);
    return { ay: a.ay, t: Date.UTC(y, m, 0), deger: a.deger };   // ayın son günü
  });
  _tufe = { im, x };
  return x;
}

/** TL seviye → TL-reel (TÜFE geometrik ara değer; aralık dışı satırlar atılır). */
function reellestir(satirlar) {
  const T = tufeAylik();
  const out = [];
  let k = 0;
  for (const x of satirlar) {
    if (x.t < T[0].t) continue;
    if (x.t > T[T.length - 1].t) break;
    while (k + 1 < T.length && T[k + 1].t < x.t) k++;
    let I;
    if (x.t === T[k].t) I = T[k].deger;
    else { const a = T[k], b = T[k + 1]; I = a.deger * Math.pow(b.deger / a.deger, (x.t - a.t) / (b.t - a.t)); }
    out.push({ t: x.t, v: x.v / I });
  }
  return out;
}

// ── Seviye → birim ───────────────────────────────────────────────────────────
function birimSeviye(ham, birim, notlar) {
  let s = ham.satirlar.filter(x => x.v > 0 && Number.isFinite(x.v));
  const para = ham.para;
  if (birim === 'USD') {
    if (para === 'TRY') { s = pv().kurlu(s); notlar.push('TL → USD: Yahoo USDTRY=X, satır günü kuru'); s = kesKurSonu(s, pv().usdtry()); }
    else if (para !== 'USD') {
      const kur = kurUSD(para);
      if (!kur) throw new Error(`seri: ${para} → USD kur serisi yok — indir({ kaynak: 'yahoo', sembol: '${para}=X' }) ile eklenebilir`);
      s = kurla(s, kur, false); notlar.push(`${para} → USD: Yahoo kur, satır günü`);
    }
    return s;
  }
  // TL / TL-reel
  if (para !== 'TRY') {
    if (para !== 'USD') {
      const kur = kurUSD(para);
      if (!kur) throw new Error(`seri: ${para} → USD kur serisi yok — indir({ kaynak: 'yahoo', sembol: '${para}=X' }) ile eklenebilir`);
      s = kurla(s, kur, false);
    }
    s = kurla(s, pv().usdtry().map(x => ({ t: x.t, c: x.c })), false);
    notlar.push('USD → TL: Yahoo USDTRY=X, satır günü kuru');
  }
  if (birim === 'TL-reel') { s = reellestir(s); notlar.push('TL-reel: TÜİK TÜFE (2025=100), ay sonu + geometrik ara değer'); }
  return s;
}
function kesKurSonu(s, kur) { const son = kur[kur.length - 1].t; return s.filter(x => x.t <= son); }

// ── Seviye → getiri (kolSerileri ile aynı) ──────────────────────────────────
function getiriUret(seviye, siklik, kismiAy) {
  if (seviye.length < 2) return { satirlar: [], baslangic: null, bitis: seviye.length ? seviye[0].t : null };
  const P = pv();
  const takvim = P.haftaIciTakvim(seviye[0].t, seviye[seviye.length - 1].t);
  const L = P.ileriTasi(seviye, takvim);
  const s = [];
  let ilk = null;
  if (siklik === 'gunluk') {
    for (let d = 1; d < takvim.length; d++) {
      if (!(L[d - 1] > 0)) continue;
      if (ilk == null) ilk = takvim[d - 1];
      s.push({ t: takvim[d], getiri: L[d] / L[d - 1] - 1 });
    }
  } else {
    const aySonIdx = [];
    for (let d = 0; d < takvim.length; d++) if (d === takvim.length - 1 || ayAnahtar(takvim[d + 1]) !== ayAnahtar(takvim[d])) aySonIdx.push(d);
    for (let i = 1; i < aySonIdx.length; i++) {
      const d0 = aySonIdx[i - 1], d1 = aySonIdx[i];
      const tAy = takvim[d1], dd = new Date(tAy);
      const tamMi = P.haftaIciTakvim(tAy + GUN, Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 0)).length === 0;
      if (!tamMi && !kismiAy) continue;
      if (!(L[d0] > 0) || !(L[d1] > 0)) continue;
      if (ilk == null) ilk = takvim[d0];
      s.push({ t: Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), 1), ay: ayAnahtar(tAy), getiri: L[d1] / L[d0] - 1 });
    }
  }
  return { satirlar: s, baslangic: ilk, bitis: takvim[takvim.length - 1] };
}

function opsDenetle(ops) {
  const o = { birim: ops.birim || 'USD', siklik: ops.siklik || 'gunluk', kismiAy: !!ops.kismiAy, tefasHizalama: ops.tefasHizalama || 'degerleme', senaryo: ops.senaryo || null };
  if (!BIRIMLER.includes(o.birim)) throw new Error(`seri: birim ${BIRIMLER.join(' | ')}`);
  if (!['gunluk', 'aylik'].includes(o.siklik)) throw new Error("seri: siklik 'gunluk' | 'aylik'");
  if (!['degerleme', 'islem'].includes(o.tefasHizalama)) throw new Error("seri: tefasHizalama 'degerleme' | 'islem'");
  return o;
}

function seriPaket(kimlik, ops = {}) {
  const o = opsDenetle(ops);
  const v = KAT.varlik(kimlik);
  const anahtar = [kimlik, o.birim, o.siklik, o.kismiAy ? 1 : 0, v.kaynakTur === 'tefas' ? o.tefasHizalama : '', o.senaryo || ''].join('|');
  let p = _bellek.al(anahtar);
  if (!p) {
    if (v.durum !== 'hazir') {
      if (v.kaynakTur === 'tefas') require('./indir').tefasKur([v.ek.kod]);   // ağsız: ham aylardan
      else throw new Error(`seri: ${kimlik} henüz indirilmemiş (durum ${v.durum}) — indir() ile`);
    }
    const notlar = [];
    if (v.not) notlar.push(v.not);
    const ham = K.KAYNAKLAR[v.kaynakTur].seviye(v, { tefasHizalama: o.tefasHizalama, senaryo: o.senaryo });
    if (o.senaryo && o.senaryo !== 'i') notlar.push(`senaryo ${o.senaryo}: ${o.senaryo === 'ii' ? 'günlük ½ bot + ½ BTC al-tut' : 'BTC al-tut'}`);
    const sev = birimSeviye(ham, o.birim, notlar);
    const g = getiriUret(sev, o.siklik, o.kismiAy);
    p = { kimlik, birim: o.birim, siklik: o.siklik, satirlar: g.satirlar, baslangic: g.baslangic == null ? null : tStr(g.baslangic),
      bitis: g.bitis == null ? null : tStr(g.bitis), seviyeSonu: sev.length ? tStr(sev[sev.length - 1].t) : null, notlar, varlik: v };
    _bellek.koy(anahtar, p);
  }
  if (!ops.bas && !ops.bit) return p;
  const b = ops.bas ? tarihT(ops.bas) : -Infinity, e = ops.bit ? tarihT(ops.bit) : Infinity;
  return { ...p, satirlar: p.satirlar.filter(x => x.t >= b && x.t <= e) };
}

/** [{t, getiri}] — döndürülen diziyi DEĞİŞTİRME (önbellekte paylaşılır). */
const seri = (kimlik, ops = {}) => seriPaket(kimlik, ops).satirlar;

function matris(kimlikler, ops = {}) {
  const o = opsDenetle(ops);
  const paketler = {};
  for (const k of kimlikler) {
    const x = typeof k === 'string' ? { kimlik: k } : k;
    const ad = x.senaryo ? `${x.kimlik}#${x.senaryo}` : x.kimlik;
    paketler[ad] = seriPaket(x.kimlik, { ...ops, senaryo: x.senaryo, tefasHizalama: x.tefasHizalama || ops.tefasHizalama });
  }
  const adlar = Object.keys(paketler);
  const bos = adlar.filter(a => !paketler[a].satirlar.length);
  if (bos.length) throw new Error('matris: boş seri: ' + bos.join(', '));
  const bas = Math.min(...adlar.map(a => tarihT(paketler[a].baslangic)));
  const sonlar = adlar.map(a => paketler[a].satirlar[paketler[a].satirlar.length - 1].t);
  const bit = (ops.bitis || 'ortak') === 'en-gec' ? Math.max(...sonlar) : Math.min(...sonlar);
  let takvim;
  if (o.siklik === 'gunluk') takvim = pv().haftaIciTakvim(bas, bit);
  else {
    takvim = [];
    const d = new Date(bas);
    for (let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); t <= bit; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) takvim.push(t);
  }
  const idx = new Map(takvim.map((t, i) => [t, i]));
  const getiri = {}, baslangic = {};
  for (const a of adlar) {
    const g = new Float64Array(takvim.length).fill(NaN);
    for (const x of paketler[a].satirlar) { const i = idx.get(x.t); if (i != null) g[i] = x.getiri; }
    getiri[a] = g; baslangic[a] = paketler[a].baslangic;
  }
  return { takvim, getiri, baslangic, bas: tStr(bas), bit: tStr(bit), birim: o.birim, siklik: o.siklik,
    notlar: Object.fromEntries(adlar.map(a => [a, paketler[a].notlar])) };
}

function onbellekTemizle() { _bellek.temizle(); _tufe = null; }

module.exports = { seri, seriPaket, matris, tufeAylik, kurUSD, onbellekTemizle, BIRIMLER,
  _ic: { kurla, reellestir, getiriUret, birimSeviye } };
