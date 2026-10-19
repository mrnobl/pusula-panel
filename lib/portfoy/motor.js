/**
 * PORTFÖY KARAR MOTORU — SİMÜLASYON, VARYASYON TARAYICI, UYGULAMA PLANI (L2).
 * Öz test: node scripts/portfoy-motor-selftest.js · API: lib/portfoy/api.js · iş parçacığı: lib/portfoy/isci.js
 * Çekirdek: lib/research/portfoyOpt.js (ağırlık yöntemleri, kısıtlar, walk-forward, dengeleme + maliyet, ölçüler, bootstrap).
 * Veri: lib/portfoy/seri.js (katalogdaki her varlık → USD | TL | TL-reel günlük getiri).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TANIM (simule / varyasyon / plan girdisi)
 * ═══════════════════════════════════════════════════════════════════════════
 *   varliklar   [{ kimlik, agirlik?, min?, max?, hesap? }]  — kimlik katalogdan (yahoo:QQQ, tefas:TI1, tr:mevduat, strateji:hucum …).
 *               agirlik yalnız yontem 'elle' için (toplam 1'e normalize edilir, not düşülür). min/max: kol sınırı (vars. 0 / 1).
 *               hesap: maliyet ve plan için hangi hesapta tutulduğu (vars. katalogdaki hesap).
 *   gruplar     [{ ad, kimlikler? | sinif? | hesap? | para?, max?, min? }] — seçiciler VE ile birleşir (ör. { ad: 'TL', para: 'TRY',
 *               max: 0.15 }, { ad: 'kripto', sinif: ['kripto', 'strateji'], max: 0.10 }). 'elle'de yalnız denetlenir (uyarı).
 *   yontem      'elle' | 'esit' | 'ters-vol' | 'risk-paritesi' | 'min-varyans' | 'cvar' | 'maks-sharpe'
 *               (vars.: ağırlık verilmişse 'elle', değilse 'esit')
 *   dengeleme   { siklik: 'aylik' | 'ceyrek' (vars.) | 'yillik' | 'yok' | 'bant', bant: 0.05, denetim: 'ay-basi' (vars.) | 'gunluk' }
 *               — her ay başı denetim; işlem ⇔ dönem başı ya da bir kolun sapması > bant (portfoyOpt sözleşmesi). 'yok': yalnız
 *               ilk yerleşim. 'bant': takvim dengelemesi yok, yalnız bant aşımı. denetim 'gunluk': bant HER işlem günü kapanışında
 *               denetlenir (837 sürüm 2 kuralı: { siklik: 'bant', bant: 0.10, denetim: 'gunluk' }; denetim B-01). Varsayılan birebir eski.
 *   maliyet     sayı (vars. 0.003: her bacak, tek yön — portfoyOpt ile aynı) | { islem, hesaplarArasi }:
 *               maliyet = islem × Σ|Δ tutar| + hesaplarArasi × Σ_hesap max(0, hesaba net giriş)  (hesaplar arası taşınan para BİR kez öder)
 *   nakitGetirisi 'yok' (vars.; ön kayıt B.6) | 'tbill' — nakit:usd kolu ^IRX T-bill getirisi alır (kol adı değişmez)
 *   birim       'USD' (vars.) | 'TL' | 'TL-reel'
 *   donem       { bas?, bit? } 'YYYY-MM-DD'
 *   kip         'walk-forward' (vars., yöntem 'elle' değilse): her ay başı yalnız geçmiş `pencereAy` (36) ayın haftalık getirisiyle hedef,
 *               sonuç ÖRNEKLEM DIŞI | 'gecmis': ağırlık TÜM dönemin verisinden bir kez (İN-SAMPLE, ileriye bakışlı) ve sabit
 *   pencereAy   walk-forward penceresi (vars. 36)
 *   eksikVeri   'kirp' (vars.): dönem tüm varlıkların verisi olduğu günden başlar | 'sonradan-katil': varlık verisi başlayınca
 *               katılır (walk-forward'da 36 ay dolunca; elle/geçmişte ağırlığı o zamana kadar diğerlerine oransal dağılır)
 *   stratejiSenaryosu 'olculen' (i) | 'yari' (ii fazla getiri yarıya) | 'btc' (iii BTC al-tut) — yalnız senaryolu stratejiler
 *               (strateji:hucum / strateji:denge; PLAN-PORTFOY B.1). Vars. 'olculen' + uyarı + üç senaryo özeti.
 *   kiyaslar    [kimlik | '60/40'] (vars. ['yahoo:QQQ', '60/40']) — tek varlık al-tut (maliyetsiz); 60/40 = QQQ/IEF, aynı dengeleme, %0,05
 *   stres       { bas?, vekil?: {kimlik: vekilKimlik | null} } — "bugünkü ağırlıklar geçmişe sabit" stresinin ayarı
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * API
 * ═══════════════════════════════════════════════════════════════════════════
 *   simule(tanim, ops)    → sonuç (aşağıda). ops: { hafif?: true (yalnız eğri + ölçüler; varyasyon içi), oncekiSharpeler?: [günlük
 *                           Sharpe] (oturumun önceki denemeleri → DSR), ilerleme?: (oran, metin) }
 *        { tanim, donem, olculer, egri: [[t, V]], dusus: [[t, dd]], yillik, aylik, kayan36, riskKatkisi, korelasyon, agirlikGecmisi,
 *          sonHedef, ortAgirlik, devir, bootstrap, stres: { donemler, sabitAgirlik }, kiyaslar, karsiKip, senaryolar, uyarilar,
 *          deneme: { gunlukSharpe, gun, dsr?, denemeSayisi? }, varliklar, notlar, sureMs }
 *   varyasyon(tanim, { degistir, adaylar: [kimlik] | { sinif?, hesap?, kategori?, metin?, etiket?, enGecBas?, limit? }, ortakDonem = true,
 *                      sirala = 'sharpe', oncekiSharpeler, ilerleme })
 *        → { mevcut, satirlar: [{ kimlik, ad, olculer, stres, pMevcuttanIyi, fark, hata? }], denemeSayisi, yeniDeneme, dsr,
 *            sansUyarisi, donem, uyarilar }
 *   guncelHedef(tanim)    → { ay, w: {kimlik: ağırlık}, kaynak } — bugün uygulanacak hedef (walk-forward: son ay başı hedefi)
 *   plan(tanim, { mevcut: [{ hesap?, kimlik, tutarUSD? | adet? | tutarTL? }], nakit?: sayı | {hesap: USD}, minIslemUSD = 10, zorla })
 *        → { hedef, toplamUSD, islemGerekmez, enBuyukSapma, islemler: [...], hesaplar: [...], transferler: [...], maliyetTahmini,
 *            sonrakiDengeleme, kur, notlar }
 *   STRES_DONEMLERI, YONTEMLER
 */
const OPT = require('../research/portfoyOpt');
const KAT = require('./katalog');
const SERI = require('./seri');
const O = require('./ortak');
const { GUN, tStr, tarihT } = O;

const pv = () => require('../research/portfoyVeri');
const nq = () => require('../research/nasdaq');

const YONTEMLER = { elle: null, esit: 'esit', 'ters-vol': 'tersVol', 'risk-paritesi': 'erc', 'min-varyans': 'minVar', cvar: 'cvar', 'maks-sharpe': 'maksSharpe' };
const SENARYO = { olculen: 'i', yari: 'ii', btc: 'iii' };
const SIKLIK = { aylik: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], ceyrek: [0, 3, 6, 9], yillik: [0], yok: [], bant: [] };
const NAKIT_KIMLIK = { USD: ['nakit:usd', 'nakit:tbill'], TL: ['tr:tl-nakit'], 'TL-reel': [] };
const NAKIT_HER = new Set(['nakit:usd', 'nakit:tbill', 'tr:tl-nakit']);

/** Tarihsel stres dönemleri: getiri = bas'tan ÖNCEKİ son kapanıştan bit'e kadarki son kapanışa. */
const STRES_DONEMLERI = [
  { kod: '2008', ad: '2008 küresel kriz', bas: '2007-10-09', bit: '2009-03-09' },
  { kod: '2018-08-TL', ad: '2018-08 TL krizi', bas: '2018-08-01', bit: '2018-08-31' },
  { kod: '2020-03', ad: '2020-03 Covid çöküşü', bas: '2020-02-19', bit: '2020-03-23' },
  { kod: '2021-12-TL', ad: '2021 sonu TL krizi', bas: '2021-11-01', bit: '2021-12-20' },
  { kod: '2022', ad: '2022 ayı piyasası', bas: '2022-01-01', bit: '2022-12-31' },
  { kod: '2025-10-10', ad: '2025-10-10 kripto çöküşü', bas: '2025-10-10', bit: '2025-10-17' },
];

// ═══ 1. TANIM ═════════════════════════════════════════════════════════════════
const sayi = (x, ad) => { if (x == null) return null; const v = Number(x); if (!Number.isFinite(v)) throw new Error(`tanım: ${ad} sayı olmalı`); return v; };
const oran01 = (x, ad) => { const v = sayi(x, ad); if (v != null && (v < 0 || v > 1)) throw new Error(`tanım: ${ad} 0–1 arası olmalı (oran; %15 → 0.15)`); return v; };

function tanimDenetle(t0) {
  if (!t0 || typeof t0 !== 'object') throw new Error('tanım: nesne bekleniyor');
  const t = JSON.parse(JSON.stringify(t0));
  if (!Array.isArray(t.varliklar) || !t.varliklar.length) throw new Error('tanım: varliklar boş');
  const notlar = [];
  const gor = new Set();
  t.varliklar = t.varliklar.map((x, i) => {
    const v = typeof x === 'string' ? { kimlik: x } : { ...x };
    if (!v.kimlik) throw new Error(`tanım: varliklar[${i}].kimlik yok`);
    if (gor.has(v.kimlik)) throw new Error(`tanım: ${v.kimlik} iki kez`);
    gor.add(v.kimlik);
    const kat = KAT.varlik(v.kimlik);   // bilinmeyende benzer önerilerle hata
    v.agirlik = sayi(v.agirlik, v.kimlik + '.agirlik'); v.min = oran01(v.min, v.kimlik + '.min'); v.max = oran01(v.max, v.kimlik + '.max');
    if (v.agirlik != null && v.agirlik < 0) throw new Error(`tanım: ${v.kimlik} ağırlığı negatif (yalnız uzun pozisyon)`);
    if (v.min != null && v.max != null && v.min > v.max) throw new Error(`tanım: ${v.kimlik} min > max`);
    v.hesap = v.hesap || kat.hesap;
    return v;
  });
  const agirlikli = t.varliklar.filter(v => v.agirlik != null).length;
  t.yontem = t.yontem || (agirlikli ? 'elle' : 'esit');
  if (!(t.yontem in YONTEMLER)) throw new Error(`tanım: yontem ${Object.keys(YONTEMLER).join(' | ')}`);
  if (t.yontem === 'elle') {
    if (agirlikli !== t.varliklar.length) throw new Error("tanım: 'elle' yönteminde her varlığın agirlik alanı olmalı");
    const s = t.varliklar.reduce((a, v) => a + v.agirlik, 0);
    if (!(s > 0)) throw new Error('tanım: ağırlık toplamı 0');
    if (Math.abs(s - 1) > 1e-6) notlar.push(`ağırlık toplamı ${(s * 100).toFixed(2)}% → %100'e oransal normalize edildi`);
    for (const v of t.varliklar) v.agirlik /= s;
  }
  const d = t.dengeleme || {};
  t.dengeleme = { siklik: d.siklik || 'ceyrek', bant: d.bant == null ? 0.05 : oran01(d.bant, 'dengeleme.bant'), ...(d.denetim && d.denetim !== 'ay-basi' ? { denetim: d.denetim } : {}) };
  if (!(t.dengeleme.siklik in SIKLIK)) throw new Error(`tanım: dengeleme.siklik ${Object.keys(SIKLIK).join(' | ')}`);
  if (t.dengeleme.denetim && t.dengeleme.denetim !== 'gunluk') throw new Error("tanım: dengeleme.denetim 'ay-basi' | 'gunluk'");
  if (t.dengeleme.siklik === 'bant' && !(t.dengeleme.bant > 0)) throw new Error("tanım: dengeleme.siklik 'bant' için bant > 0 olmalı");
  if (t.maliyet == null) t.maliyet = 0.003;
  else if (typeof t.maliyet === 'number') oran01(t.maliyet, 'maliyet');
  else t.maliyet = { islem: oran01(t.maliyet.islem || 0, 'maliyet.islem'), hesaplarArasi: oran01(t.maliyet.hesaplarArasi || 0, 'maliyet.hesaplarArasi') };
  t.nakitGetirisi = t.nakitGetirisi || 'yok';
  if (!['yok', 'tbill'].includes(t.nakitGetirisi)) throw new Error("tanım: nakitGetirisi 'yok' | 'tbill'");
  t.birim = t.birim || 'USD';
  if (!SERI.BIRIMLER.includes(t.birim)) throw new Error(`tanım: birim ${SERI.BIRIMLER.join(' | ')}`);
  t.donem = t.donem || {};
  for (const k of ['bas', 'bit']) {
    if (!t.donem[k]) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.donem[k])) throw new Error(`tanım: donem.${k} YYYY-AA-GG`);
    const d = new Date(t.donem[k] + 'T00:00:00Z');   // 2024-13-45 / 2023-02-29 sessizce başka güne kaymasın (L4)
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== t.donem[k]) throw new Error(`tanım: donem.${k} geçersiz tarih (${t.donem[k]})`);
  }
  if (t.donem.bas && t.donem.bit && t.donem.bas >= t.donem.bit) throw new Error(`tanım: donem.bas (${t.donem.bas}) donem.bit'ten (${t.donem.bit}) önce olmalı`);
  t.kip = t.kip || (t.yontem === 'elle' ? 'gecmis' : 'walk-forward');
  if (!['gecmis', 'walk-forward'].includes(t.kip)) throw new Error("tanım: kip 'gecmis' | 'walk-forward'");
  t.pencereAy = t.pencereAy == null ? 36 : Math.round(sayi(t.pencereAy, 'pencereAy'));
  if (t.pencereAy < 6 || t.pencereAy > 120) throw new Error('tanım: pencereAy 6–120');
  t.eksikVeri = t.eksikVeri || 'kirp';
  if (!['kirp', 'sonradan-katil'].includes(t.eksikVeri)) throw new Error("tanım: eksikVeri 'kirp' | 'sonradan-katil'");
  if (t.kip === 'gecmis' && t.yontem !== 'elle' && t.eksikVeri !== 'kirp') { t.eksikVeri = 'kirp'; notlar.push("geçmiş (in-sample) kipte ağırlık tüm dönemden hesaplandığı için eksikVeri 'kirp' uygulandı"); }
  t.stratejiSenaryosu = t.stratejiSenaryosu || 'olculen';
  if (!(t.stratejiSenaryosu in SENARYO)) throw new Error("tanım: stratejiSenaryosu 'olculen' | 'yari' | 'btc'");
  t.kiyaslar = t.kiyaslar == null ? ['yahoo:QQQ', '60/40'] : t.kiyaslar;
  for (const k of t.kiyaslar) if (k !== '60/40') KAT.varlik(k);
  t.gruplar = (t.gruplar || []).map((g, i) => {
    const ad = g.ad || `grup ${i + 1}`;
    const max = oran01(g.max, ad + '.max'), min = oran01(g.min, ad + '.min');
    const uy = t.varliklar.filter(v => {
      const k = KAT.varlik(v.kimlik);
      const dizi = x => (Array.isArray(x) ? x : [x]);
      if (g.kimlikler && !dizi(g.kimlikler).includes(v.kimlik)) return false;
      if (g.sinif && !dizi(g.sinif).includes(k.sinif)) return false;
      if (g.hesap && !dizi(g.hesap).includes(v.hesap)) return false;
      if (g.para && !dizi(g.para).includes(k.paraBirimi)) return false;
      return !!(g.kimlikler || g.sinif || g.hesap || g.para);
    }).map(v => v.kimlik);
    if (!uy.length) notlar.push(`grup '${ad}' hiçbir varlıkla eşleşmedi`);
    return { ad, max, min, kollar: uy, secici: { kimlikler: g.kimlikler, sinif: g.sinif, hesap: g.hesap, para: g.para } };
  });
  t.stres = t.stres || {};
  t._notlar = notlar;
  return t;
}

// ═══ 2. VERİ → MATRİS ═════════════════════════════════════════════════════════
function senaryoAl(kimlik, sen) {
  const v = KAT.varlik(kimlik);
  return v.ek && Array.isArray(v.ek.senaryolar) && v.ek.senaryolar.includes(sen) ? sen : null;
}
/** Bir kolun getiri paketi (birimde): nakit:usd + tbill → T-bill serisi, senaryolu strateji → senaryo. */
function kolPaket(kimlik, t, { senaryo } = {}) {
  let k = kimlik;
  if (kimlik === 'nakit:usd' && t.nakitGetirisi === 'tbill') k = 'nakit:tbill';
  const sen = senaryoAl(k, senaryo || SENARYO[t.stratejiSenaryosu]);
  const p = SERI.seriPaket(k, { birim: t.birim, ...(sen ? { senaryo: sen } : {}) });
  return { satirlar: p.satirlar, baslangic: p.baslangic, notlar: p.notlar, kaynakKimlik: k, senaryo: sen };
}
/** satirlar {k: [{t, getiri}]} → ortak Pzt–Cum takvimi [bas, bit] üzerinde Float64Array (veri yok = NaN). */
function hizala(satirlar, basT, bitT) {
  const takvim = pv().haftaIciTakvim(basT, bitT);
  const ix = new Map(takvim.map((t, i) => [t, i]));
  const getiri = {};
  for (const [k, s] of Object.entries(satirlar)) {
    const g = new Float64Array(takvim.length).fill(NaN);
    for (const x of s) { const i = ix.get(x.t); if (i != null) g[i] = x.getiri; }
    getiri[k] = g;
  }
  return { takvim, getiri };
}
/** Tanımın kollarını hazırlar: başlangıç günleri, ortak son gün, dönem başı (kırp / sonradan katıl). */
function veriHazirla(t, ops = {}) {
  const kollar = t.varliklar.map(v => v.kimlik);
  const paket = {};
  for (const k of kollar) paket[k] = kolPaket(k, t, ops);
  const bos = kollar.filter(k => !paket[k].satirlar.length);
  if (bos.length) throw new Error('veri yok: ' + bos.join(', '));
  const basT = {}; for (const k of kollar) basT[k] = tarihT(paket[k].baslangic);
  const sonT = Math.min(...kollar.map(k => paket[k].satirlar[paket[k].satirlar.length - 1].t));
  const riskli = kollar.filter(k => !NAKIT_HER.has(k));
  const kaynak = riskli.length ? riskli : kollar;
  let bas, kirpan = null;
  if (t.eksikVeri === 'kirp') {
    bas = Math.max(...kollar.map(k => basT[k]));
    kirpan = kollar.find(k => basT[k] === bas);
  } else bas = Math.min(...kaynak.map(k => basT[k]));
  const istenen = t.donem.bas ? tarihT(t.donem.bas) : null;
  if (istenen != null && istenen > bas) { bas = istenen; kirpan = null; }
  let bit = sonT;
  if (t.donem.bit) bit = Math.min(bit, tarihT(t.donem.bit));
  if (bit - bas < 60 * GUN) throw new Error(`ortak dönem çok kısa (${tStr(bas)} → ${tStr(bit)})`);
  const s = {}; for (const k of kollar) s[k] = paket[k].satirlar.filter(x => x.t > bas && x.t <= bit);
  const { takvim, getiri } = hizala(s, bas, bit);
  return { kollar, paket, basT, bas, bit, sonT, kirpan, istenen, takvim, getiri };
}

// ═══ 3. ÇEKİRDEK KOŞU ═════════════════════════════════════════════════════════
function nakitKolu(t, kollar) { for (const k of NAKIT_KIMLIK[t.birim]) if (kollar.includes(k)) return k; return null; }
function maliyetKur(t, kollar) {
  if (typeof t.maliyet === 'number') return { maliyet: t.maliyet, maliyetFn: null };
  const hesap = kollar.map(k => t.varliklar.find(v => v.kimlik === k).hesap);
  const hesaplar = [...new Set(hesap)];
  const { islem, hesaplarArasi } = t.maliyet;
  return { maliyet: 0, maliyetFn: (delta) => {
    let c = 0; const net = new Map(hesaplar.map(h => [h, 0]));
    for (let k = 0; k < delta.length; k++) { c += islem * Math.abs(delta[k]); net.set(hesap[k], net.get(hesap[k]) + delta[k]); }
    for (const v of net.values()) if (v > 0) c += hesaplarArasi * v;
    return c;
  } };
}
/** Walk-forward ilk hedef ayı: takvimin ilk gününden SONRAKİ ay başı + pencere (ilk gün getirisiz taban günüdür; pencere tam dolar). */
function ilkAyBasi(t0, pencereAy) {
  const d = new Date(t0);
  return OPT.ayEkle(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1), pencereAy);
}
/** Tek koşu: veri (veriHazirla çıktısı) + tanım → walkForward sonucu ve meta. */
function kos(t, V) {
  const { kollar, takvim, getiri } = V;
  const nakit = nakitKolu(t, kollar);
  const tavan = {}, taban = {};
  let tabanVar = false;
  for (const v of t.varliklar) { tavan[v.kimlik] = v.max != null ? v.max : 1; if (v.min) { taban[v.kimlik] = v.min; tabanVar = true; } }
  const gruplar = t.yontem === 'elle' ? null : t.gruplar.filter(g => g.kollar.length).map(g => ({ ad: g.ad, kollar: g.kollar, max: g.max, min: g.min }));
  const ortak = { takvim, getiri, kollar, ceyrek: SIKLIK[t.dengeleme.siklik], bant: t.dengeleme.siklik === 'yok' ? Infinity : t.dengeleme.bant,
    nakit: nakit || '__nakit_yok__', ...maliyetKur(t, kollar), ...(t.dengeleme.denetim === 'gunluk' ? { gunlukBant: true } : {}) };
  let r, agirlikKaynak, gecmisW = null, gecmisNot = null;
  if (t.yontem === 'elle') {
    const sabit = Object.fromEntries(t.varliklar.map(v => [v.kimlik, v.agirlik]));
    r = OPT.walkForward({ ...ortak, sabit, tavan: {}, oosBas: takvim[0], pencereAy: 0, uygunluk: 'veri' });
    agirlikKaynak = 'elle';
  } else if (t.kip === 'gecmis') {
    const { X } = OPT.haftalikMatris(takvim, getiri, kollar, takvim[0], takvim[takvim.length - 1] + GUN);
    if (X.length < 10) throw new Error('geçmiş kip: ağırlık için en az 10 tam hafta gerekir');
    const hi = Float64Array.from(kollar, k => tavan[k]);
    const kisit = OPT.kisitEsle(kollar, tabanVar ? taban : null, gruplar);
    const o = OPT.agirlikKisitli(YONTEMLER[t.yontem], X, { hi, nakit: kollar.indexOf(nakit), ...kisit });
    gecmisW = Object.fromEntries(kollar.map((k, j) => [k, o.w[j]])); gecmisNot = o.not || null;
    r = OPT.walkForward({ ...ortak, sabit: gecmisW, tavan: {}, oosBas: takvim[0], pencereAy: 0, uygunluk: 'veri' });
    agirlikKaynak = 'gecmis';
  } else {
    const oosBas = ilkAyBasi(takvim[0], t.pencereAy);
    if (oosBas > takvim[takvim.length - 1]) throw new Error(`walk-forward: ${t.pencereAy} aylık pencere için veri yetmiyor (${tStr(takvim[0])} → ${tStr(takvim[takvim.length - 1])}). Daha kısa pencere ya da 'geçmiş' kip.`);
    r = OPT.walkForward({ ...ortak, yontem: YONTEMLER[t.yontem], tavan, taban: tabanVar ? taban : null, gruplar, oosBas, pencereAy: t.pencereAy,
      uygunluk: 'pencere' });
    // Hiç uygun kol yoksa (sonradan katılımda pencere dolmadı) ilk aylar 0 ağırlık → eğri düz kalır; walkForward bunu atmaz ama
    // eldeki toplam 0 olur. Bunu yakala:
    if (!r.egri.length || !(r.egri[r.egri.length - 1].oz > 0)) throw new Error('walk-forward: ilk ay başında hiçbir varlığın 36 aylık geçmişi yok');
    agirlikKaynak = 'walk-forward';
  }
  return { r, nakit, agirlikKaynak, gecmisW, gecmisNot };
}

// ═══ 4. ÖLÇÜLER VE TÜREVLER ═══════════════════════════════════════════════════
function olculer(egri, rf) {
  const m = OPT.olcu(egri);
  if (!m) return null;
  const { yillar, ...o } = m;
  o.calmar = o.maxDD > 0 ? o.cagr / o.maxDD : null;
  if (rf) {
    const r = egri.slice(1).map((x, i) => x.oz / egri[i].oz - 1 - (rf.get(x.time) || 0));
    const ort = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - ort) ** 2, 0) / (r.length - 1));
    o.sharpeTbill = sd > 0 ? ort / sd * Math.sqrt(261) : null;
  }
  return o;
}
function tbillHaritasi(t) {
  if (t.birim !== 'USD') return null;
  try { return new Map(SERI.seri('nakit:tbill', { birim: 'USD' }).map(x => [x.t, x.getiri])); } catch (e) { return null; }
}
function aySonlari(egri) {
  const o = [];
  for (let i = 0; i < egri.length; i++) {
    const a = tStr(egri[i].time).slice(0, 7);
    if (i === egri.length - 1 || tStr(egri[i + 1].time).slice(0, 7) !== a) o.push({ ay: a, v: egri[i].oz, time: egri[i].time });
  }
  return o;
}
function aylikGetiri(egri) {
  const s = aySonlari(egri); const o = [];
  let onceki = egri[0].oz;
  for (const x of s) { o.push({ ay: x.ay, getiri: x.v / onceki - 1 }); onceki = x.v; }
  return o;
}
function kayan36(egri) {
  const s = aySonlari(egri); const out = [];
  const aylik = s.map((x, i) => (i ? x.v / s[i - 1].v - 1 : NaN));
  for (let i = 36; i < s.length; i++) {
    const p = aylik.slice(i - 35, i + 1);
    const ort = p.reduce((a, b) => a + b, 0) / 36, sd = Math.sqrt(p.reduce((a, b) => a + (b - ort) ** 2, 0) / 35);
    out.push({ ay: s[i].ay, cagr: Math.pow(s[i].v / s[i - 36].v, 1 / 3) - 1, sharpe: sd > 0 ? ort / sd * Math.sqrt(12) : null });
  }
  return out;
}
function korelasyon(takvim, getiri, kollar, a, b) {
  // Haftalık bileşik getiri; çiftler ortak (ikisinin de tam haftası olan) haftalarda.
  const hafta = new Map();
  for (let i = 0; i < takvim.length; i++) { if (takvim[i] < a || takvim[i] > b) continue; const p = OPT.pazartesi(takvim[i]); if (!hafta.has(p)) hafta.set(p, []); hafta.get(p).push(i); }
  const W = {};
  for (const k of kollar) W[k] = [...hafta.values()].map(ix => { if (ix.length < 3) return NaN; let v = 1; for (const i of ix) { const r = getiri[k][i]; if (!Number.isFinite(r)) return NaN; v *= 1 + r; } return v - 1; });
  const M = kollar.map(() => new Array(kollar.length).fill(null));
  for (let i = 0; i < kollar.length; i++) for (let j = i; j < kollar.length; j++) {
    const x = W[kollar[i]], y = W[kollar[j]]; const ix = []; for (let q = 0; q < x.length; q++) if (Number.isFinite(x[q]) && Number.isFinite(y[q])) ix.push(q);
    if (ix.length < 20) continue;
    const mx = ix.reduce((s, q) => s + x[q], 0) / ix.length, my = ix.reduce((s, q) => s + y[q], 0) / ix.length;
    let sxy = 0, sxx = 0, syy = 0; for (const q of ix) { sxy += (x[q] - mx) * (y[q] - my); sxx += (x[q] - mx) ** 2; syy += (y[q] - my) ** 2; }
    const c = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
    M[i][j] = M[j][i] = c;
  }
  return { kimlikler: kollar, matris: M, hafta: hafta.size, siklik: 'haftalik' };
}
/** Pencere getirisi: bas'tan önceki son kapanış → bit'e kadarki son kapanış; pencere içi en büyük düşüş. Kapsanmıyorsa null. */
function pencereGetirisi(egri, basS, bitS) {
  const b = tarihT(basS), e = tarihT(bitS);
  if (!egri.length || egri[0].time >= b || egri[egri.length - 1].time < e) return null;
  let i0 = -1; for (let i = 0; i < egri.length && egri[i].time < b; i++) i0 = i;
  let i1 = i0; for (let i = i0; i < egri.length && egri[i].time <= e; i++) i1 = i;
  let tepe = egri[i0].oz, dd = 0; for (let i = i0; i <= i1; i++) { tepe = Math.max(tepe, egri[i].oz); dd = Math.max(dd, 1 - egri[i].oz / tepe); }
  return { getiri: egri[i1].oz / egri[i0].oz - 1, maxDD: dd };
}
function stresDonemleri(egri, kiyasEgrileri = {}) {
  return STRES_DONEMLERI.map(d => ({ ...d, portfoy: pencereGetirisi(egri, d.bas, d.bit),
    kiyas: Object.fromEntries(Object.entries(kiyasEgrileri).map(([ad, e]) => [ad, pencereGetirisi(e, d.bas, d.bit)])) }));
}
const ciftDizi = (egri, f = x => x.oz) => egri.map(x => [x.time, +f(x).toPrecision(10)]);
function dususEgrisi(egri) { let tepe = -Infinity; return egri.map(x => { tepe = Math.max(tepe, x.oz); return [x.time, +(1 - x.oz / tepe).toPrecision(8)]; }); }

// ═══ 5. KIYASLAR ══════════════════════════════════════════════════════════════
function kiyasKos(ad, t, bas, bit) {
  const spec = ad === '60/40' ? { 'yahoo:QQQ': 0.6, 'yahoo:IEF': 0.4 } : { [ad]: 1 };
  const kollar = Object.keys(spec);
  const satir = {}; let kb = -Infinity;
  for (const k of kollar) { const p = SERI.seriPaket(k, { birim: t.birim }); satir[k] = p.satirlar.filter(x => x.t > bas && x.t <= bit); kb = Math.max(kb, tarihT(p.baslangic)); }
  const b2 = Math.max(bas, kb);
  for (const k of kollar) satir[k] = satir[k].filter(x => x.t > b2);
  const son = Math.min(...kollar.map(k => (satir[k].length ? satir[k][satir[k].length - 1].t : -Infinity)));
  if (!(son - b2 > 20 * GUN)) return { ad, hata: 'kıyas verisi dönemi kapsamıyor' };
  const { takvim, getiri } = hizala(satir, b2, son);
  const r = OPT.walkForward({ takvim, getiri, kollar, sabit: spec, tavan: {}, oosBas: takvim[0], pencereAy: 0, uygunluk: 'veri',
    ceyrek: kollar.length > 1 ? SIKLIK[t.dengeleme.siklik] : [], bant: kollar.length > 1 && t.dengeleme.siklik !== 'yok' ? t.dengeleme.bant : Infinity,
    maliyet: kollar.length > 1 ? 0.0005 : 0, nakit: '__yok__' });
  return { ad: ad === '60/40' ? '60/40 QQQ/IEF' : ad, kimlik: ad, egri: r.egri, bas: tStr(takvim[0]), kirpildi: b2 > bas ? tStr(b2) : null };
}

// ═══ 6. SABİT AĞIRLIK STRESİ ("bugünkü ağırlıklar geçmişe sabit uygulansaydı") ═══
/** Kısa geçmişli varlık için uzun vekil (yalnız varlığın verisi başlamadan ÖNCEKİ günlerde kullanılır). */
function vekilSec(kimlik) {
  const v = KAT.varlik(kimlik);
  if (v.kaynakTur === 'tefas') {
    const a = v.altKategori || '';
    if (/Altın/i.test(a)) return 'yahoo:GC=F';
    if (/Hisse senedi/i.test(a)) return 'yahoo:XU100.IS';
    if (/Yabancı/i.test(a)) return 'yahoo:SPY';
    if (/Eurobond/i.test(a)) return 'nakit:usd';
    return 'tr:mevduat';
  }
  if (v.sinif === 'strateji') {
    const id = v.ek && v.ek.strateji;
    if (id === 'qqq-m10') return 'yahoo:QQQ';            // hisse stratejileri (tasarımcı F1): kendi piyasasının endeksi
    if (id === 'bist-m10') return 'yahoo:XU100.IS';
    return id === 'nasdaq-n1' ? null : 'kripto:BTC-bitstamp';
  }
  if (v.sinif === 'kripto' && kimlik !== 'kripto:BTC-bitstamp') return 'kripto:BTC-bitstamp';
  const Y = { 'yahoo:QQQ': 'yahoo:^NDX', 'yahoo:SPY': 'yahoo:^GSPC', 'yahoo:IWM': 'yahoo:^RUT', 'yahoo:DIA': 'yahoo:^DJI', 'yahoo:GLD': 'yahoo:GC=F',
    'yahoo:IAU': 'yahoo:GC=F', 'yahoo:SLV': 'yahoo:SI=F', 'yahoo:USO': 'yahoo:CL=F' };
  return Y[kimlik] || null;
}
function sabitStres(t, w, ops = {}) {
  const kollar = Object.keys(w).filter(k => w[k] > 1e-9);
  const vekilAyar = (t.stres && t.stres.vekil) || {};
  const satir = {}, kbas = {}, vekiller = {};
  for (const k of kollar) {
    const p = kolPaket(k, t);
    const ownB = tarihT(p.baslangic);
    // vekil: kimlik (yalnız varlığın verisinden ÖNCE) | { kimlik, tum: true } (tüm dönem vekille — PLAN-PORTFOY stresinin kuralı) | null
    const ay = Object.prototype.hasOwnProperty.call(vekilAyar, k) ? vekilAyar[k] : vekilSec(k);
    const vk = ay && typeof ay === 'object' ? ay.kimlik : ay, tumu = !!(ay && typeof ay === 'object' && ay.tum);
    let s = p.satirlar, b = ownB;
    if (vk && vk !== k && KAT.varMi(vk)) {
      const q = kolPaket(vk, t);
      const vb = tarihT(q.baslangic);
      if (tumu) { s = q.satirlar; b = vb; vekiller[k] = { vekil: vk, tumDonem: true }; }
      else if (vb < ownB) { s = q.satirlar.filter(x => x.t <= ownB).concat(p.satirlar); b = vb; vekiller[k] = { vekil: vk, bitis: tStr(ownB) }; }
    }
    satir[k] = s; kbas[k] = b;
  }
  let bas = Math.max(...kollar.map(k => kbas[k]));
  const sinirlayan = kollar.find(k => kbas[k] === bas);
  if (t.stres && t.stres.bas) bas = Math.max(bas, tarihT(t.stres.bas));
  const bit = Math.min(...kollar.map(k => satir[k][satir[k].length - 1].t));
  for (const k of kollar) satir[k] = satir[k].filter(x => x.t > bas && x.t <= bit);
  const { takvim, getiri } = hizala(satir, bas, bit);
  const tt = { ...t, varliklar: kollar.map(k => ({ ...(t.varliklar.find(v => v.kimlik === k) || { kimlik: k, hesap: KAT.varlik(k).hesap }) })) };
  const r = OPT.walkForward({ takvim, getiri, kollar, sabit: w, tavan: {}, oosBas: takvim[0], pencereAy: 0, uygunluk: 'veri',
    ceyrek: SIKLIK[t.dengeleme.siklik], bant: t.dengeleme.siklik === 'yok' ? Infinity : t.dengeleme.bant, nakit: '__yok__', ...maliyetKur(tt, kollar),
    ...(t.dengeleme.denetim === 'gunluk' ? { gunlukBant: true } : {}) });
  const m = OPT.olcu(r.egri);
  return {
    aciklama: 'son hedef ağırlıklar SABİT tutulup verinin izin verdiği en eski günden uygulandı (bilgi; ileriye bakışlı — bugünkü ağırlık geçmişte bilinmezdi)',
    agirlik: w, bas: tStr(takvim[0]), bit: tStr(takvim[takvim.length - 1]), sinirlayan, vekiller,
    cagr: m.cagr, maxDD: m.maxDD, maxDDTarih: m.maxDDTarih, sharpe: m.sharpe, enKotuAy: m.enKotuAy, enKotuYil: m.enKotuYil,
    yillar: m.yillar.map(y => ({ yil: y.yil, getiri: y.getiri, kismi: y.kismi })),
    donemler: STRES_DONEMLERI.map(d => ({ kod: d.kod, ad: d.ad, ...(pencereGetirisi(r.egri, d.bas, d.bit) || { getiri: null, maxDD: null }) })),
    egri: ops.egri === false ? undefined : ciftDizi(seyrelt(r.egri, 1500)),
  };
}
function seyrelt(egri, n) { if (egri.length <= n) return egri; const adim = egri.length / n; const o = []; for (let i = 0; i < n; i++) o.push(egri[Math.floor(i * adim)]); o.push(egri[egri.length - 1]); return o; }

// ═══ 7. UYARILAR ══════════════════════════════════════════════════════════════
const yz = (x, k = 1) => (x == null || !Number.isFinite(x) ? '—' : '%' + (x * 100).toFixed(k).replace('.', ','));
function tlTasima(v) { return v.sinif === 'tl-nakit' || (v.kaynakTur === 'tefas' && !/Altın|Yabancı|Eurobond|Hisse senedi/i.test(v.altKategori || '')); }
function uyarilar(t, ctx) {
  const U = [], ekle = (kod, seviye, metin) => U.push({ kod, seviye, metin });
  const { V, r, olc, sabit, agirlikRef } = ctx;
  // Pay = ağırlık vektörlerinden (ortalama, son hedef) HER BİRİNDE toplanır, en büyüğü alınır. Kol başına max alıp toplamak farklı
  // zamanların paylarını birleştirip hiç var olmamış bir portföy üretiyordu (L4: TL ≤ %15 kısıtlıyken %21,6 KRİTİK).
  const setler = (ctx.agirlikSetleri && ctx.agirlikSetleri.length) ? ctx.agirlikSetleri : (agirlikRef ? [agirlikRef] : []);
  const payMax = f => Math.max(0, ...setler.map(w => V.kollar.reduce((a, k) => a + (f(k) ? w[k] || 0 : 0), 0)));
  const TOL = 0.005;   // %15'e kısıtla oturan portföyde ay içi kaymadan doğan ≤ yarım puan aşım alarm üretmez
  if (t.yontem !== 'elle' && t.kip === 'gecmis') ekle('in-sample', 'kritik', 'GEÇMİŞE BAKARAK (in-sample): ağırlıklar tüm dönemin verisinden hesaplandı — sonuç iyimser ve gerçekte elde edilemezdi. Walk-forward (görülmemiş veri) sonucuyla karşılaştırın (karsiKip).');
  if (t.yontem === 'elle') ekle('elle-secim', 'bilgi', 'Ağırlıklar elle verildi: bu dönemin sonuçlarına bakarak seçildiyse sonuç in-sample sayılır. Sabit-ağırlık stresine ve walk-forward yöntemlerine de bakın.');
  if (olc) {
    const yil = olc.yilSayisi;
    if (yil < 3) ekle('kisa-veri', 'kritik', `Değerlendirme dönemi yalnız ${yil.toFixed(1).replace('.', ',')} yıl (${olc.bas} → ${olc.bit}) — ölçüler istatistiksel olarak anlamsız.`);
    else if (yil < 7) ekle('kisa-veri', 'uyari', `Değerlendirme dönemi ${yil.toFixed(1).replace('.', ',')} yıl — tam bir piyasa döngüsü içermeyebilir.`);
  }
  if (V.kirpan && t.eksikVeri === 'kirp') {
    const digerleri = V.kollar.filter(k => k !== V.kirpan && !NAKIT_HER.has(k));
    const enErken = digerleri.length ? Math.max(...digerleri.map(k => V.basT[k])) : V.bas;
    if (V.bas - enErken > 365 * GUN) ekle('kirpildi', 'uyari', `Dönem ${V.kirpan} verisinin başlangıcı (${tStr(V.bas)}) nedeniyle kırpıldı; o varlık olmadan ${tStr(enErken)}'den başlayabilirdi. "Verisi başlayınca portföye kat" ayarını ya da uzun geçmişli bir benzerini (vekil) düşünün.`);
  }
  if (V.istenen != null && V.istenen < V.bas - 7 * GUN) ekle('kirpildi', 'uyari', `İstenen başlangıç ${tStr(V.istenen)}, veri ancak ${tStr(V.bas)}'den başlıyor.`);
  if (t.eksikVeri === 'sonradan-katil') {
    const gec = V.kollar.filter(k => V.basT[k] > V.bas + 30 * GUN && !NAKIT_HER.has(k));
    if (gec.length) ekle('gec-katilim', 'uyari', `Sonradan katılan varlıklar: ${gec.map(k => `${k} (${tStr(V.basT[k])})`).join(', ')} — o tarihe kadar portföy onlarsız; dönemin başı farklı bir portföydür.`);
  }
  const kat = Object.fromEntries(V.kollar.map(k => [k, KAT.varlik(k)]));
  const vekilli = V.kollar.filter(k => kat[k].etiketler.includes('vekil') || /vekil|temettüsüz|fiyat endeksi/i.test(kat[k].not || ''));
  if (vekilli.length) ekle('vekil', 'uyari', `Vekil / düzeltilmemiş seri: ${vekilli.map(k => `${k} (${kat[k].not || 'vekil'})`).join(' · ')}`);
  const yok = V.kollar.filter(k => kat[k].hesap === 'yok' && !t.varliklar.find(v => v.kimlik === k && v.hesap && v.hesap !== 'yok'));
  if (yok.length) ekle('alinamaz', 'uyari', `Doğrudan alınamayan seri (endeks/vadeli): ${yok.join(', ')} — gerçekte ETF/fon ile ve takip farkıyla tutulur.`);
  const iyimser = V.kollar.filter(k => kat[k].etiketler.includes('iyimser'));
  if (iyimser.length && t.stratejiSenaryosu !== 'btc') ekle('iyimser-strateji', t.stratejiSenaryosu === 'olculen' ? 'kritik' : 'uyari', `Strateji serileri iyimser (yüzlerce denemeden seçildi, aynı veride ölçüldü): ${iyimser.join(', ')}. Şu an: ${({ olculen: 'ölçülen (iyimser)', yari: 'fazla getirisi yarıya' })[t.stratejiSenaryosu] || t.stratejiSenaryosu}. Karar için "BTC al-tut" senaryosunda da kabul edilebilir olmalı.`);
  if (t.varliklar.some(v => kat[v.kimlik].kaynakTur === 'tefas')) ekle('tefas-stopaj', 'bilgi', 'TEFAS fon getirileri stopaj ÖNCESİ (fon stopajı düşülmedi); tr:mevduat stopaj SONRASI — aynı vergi tabanında değil.');
  // TL yoğunlaşması
  if (agirlikRef) {
    const tasima = payMax(k => tlTasima(kat[k]));
    const tryTop = payMax(k => kat[k].paraBirimi === 'TRY');
    if (tasima > 0.15 + TOL) ekle('tl-yogunlasma', 'kritik', `TL faiz/taşıma payı ${yz(tasima)} (> %15). TL taşıma son yıllarda USD'de yüksek ve düşük oynaklıklı göründü, ama 2018-08 ve 2021-12 kur krizlerinde USD değeri sert düştü (PLAN-PORTFOY denetimi: Ekim 2026 hedefi 2014'ten sabit tutulsaydı MaxDD %48,6). Sabit-ağırlık stresine bakın.`);
    else if (tryTop > 0.25) ekle('tl-yogunlasma', 'uyari', `TL cinsi varlık payı ${yz(tryTop)} — kur riski.`);
    // Tek rejim
    if (olc) {
      const kapsar = kod => { const d = STRES_DONEMLERI.find(x => x.kod === kod); return olc.bas < d.bas && olc.bit >= d.bit; };
      const pay = f => payMax(k => f(kat[k]));
      const eksik = [];
      if (pay(v => v.paraBirimi === 'TRY') > 0.05 && !kapsar('2018-08-TL') && !kapsar('2021-12-TL')) eksik.push('TL kur krizi (2018-08 / 2021-12)');
      if (pay(v => ['hisse-endeks', 'hisse'].includes(v.sinif) || /Hisse|Yabancı/i.test(v.altKategori || '')) > 0.1 && !kapsar('2008') && !kapsar('2020-03') && !kapsar('2022')) eksik.push('hisse ayı piyasası (2008 / 2020-03 / 2022)');
      if (pay(v => ['kripto', 'strateji'].includes(v.sinif)) > 0.05 && !kapsar('2022')) eksik.push('kripto ayısı (2022)');
      if (eksik.length) ekle('tek-rejim', 'kritik', `Değerlendirme dönemi şu rejimleri İÇERMİYOR: ${eksik.join('; ')}. Düşüş ve oynaklık ölçüleri bu yüzden iyimser — sabit-ağırlık stresine bakın.`);
    }
  }
  if (sabit && olc && sabit.maxDD > Math.max(1.5 * olc.maxDD, olc.maxDD + 0.10)) ekle('stres-farki', 'kritik', `Bugünkü ağırlıklar ${sabit.bas}'den sabit uygulansaydı MaxDD ${yz(sabit.maxDD)} (${sabit.maxDDTarih}) olurdu; değerlendirme döneminde görülen ${yz(olc.maxDD)}. Sonuç bu riski göstermiyor.`);
  if (r && olc) {
    const devirY = r.devirToplam / olc.yilSayisi;
    if (devirY > 1) ekle('devir-yuksek', 'uyari', `Yıllık devir ${yz(devirY, 0)} — maliyet modelin dışında vergi olayı da doğurur (her satış).`);
    const gevsek = r.aylar.filter(a => a.not && /gevşetildi|kısıtsız|kalan nakitte/.test(a.not));
    if (gevsek.length) ekle('kisit-gevsetildi', 'uyari', `${gevsek.length} ayda kısıtlar uygun varlık yetersizliğinden gevşetildi (ilk: ${gevsek[0].ay} — ${gevsek[0].not}).`);
  }
  if (t.yontem === 'elle') {
    const w = Object.fromEntries(t.varliklar.map(v => [v.kimlik, v.agirlik]));
    const ihlal = [];
    for (const v of t.varliklar) { if (v.max != null && v.agirlik > v.max + 1e-9) ihlal.push(`${v.kimlik} > max`); if (v.min != null && v.agirlik < v.min - 1e-9) ihlal.push(`${v.kimlik} < min`); }
    for (const g of t.gruplar) { const s = g.kollar.reduce((a, k) => a + w[k], 0); if (g.max != null && s > g.max + 1e-9) ihlal.push(`${g.ad} ${yz(s)} > ${yz(g.max)}`); if (g.min != null && s < g.min - 1e-9) ihlal.push(`${g.ad} ${yz(s)} < ${yz(g.min)}`); }
    if (ihlal.length) ekle('kisit-ihlali', 'uyari', `Elle ağırlıklar kısıtları ihlal ediyor (elle yöntemde kısıtlar uygulanmaz): ${ihlal.join('; ')}`);
  }
  const nk = nakitKolu(t, V.kollar);
  if (nk === 'nakit:usd' && t.nakitGetirisi === 'yok' && agirlikRef && (agirlikRef[nk] || 0) > 0.1) ekle('nakit-sifir', 'bilgi', `USD nakit payı ${yz(agirlikRef[nk])} ve getirisi 0 varsayıldı — gerçekte T-bill/para piyasası getirisi alınabilir (nakitGetirisi: 'tbill').`);
  for (const n of t._notlar || []) ekle('tanim', 'bilgi', n);
  const sira = { kritik: 0, uyari: 1, bilgi: 2 };
  return U.sort((a, b) => sira[a.seviye] - sira[b.seviye]);
}

// ═══ 8. SİMÜLE ════════════════════════════════════════════════════════════════
function simule(tanim, ops = {}) {
  const t0 = Date.now();
  const ilerle = ops.ilerleme || (() => {});
  const t = tanim && tanim._denetlendi ? tanim : { ...tanimDenetle(tanim), _denetlendi: true };
  ilerle(0.05, 'Veri hazırlanıyor');
  const V = ops.veri || veriHazirla(t);
  ilerle(0.15, 'Simülasyon');
  const { r, nakit, agirlikKaynak, gecmisW, gecmisNot } = kos(t, V);
  const rf = tbillHaritasi(t);
  const olc = olculer(r.egri, rf);
  const gunluk = r.gunluk.r;
  const deneme = { gunlukSharpe: nq().gunlukSharpe(gunluk), gun: gunluk.length };
  if (ops.oncekiSharpeler) {
    const liste = [...ops.oncekiSharpeler, deneme.gunlukSharpe];
    deneme.denemeSayisi = liste.length;
    deneme.dsr = liste.length >= 2 ? nq().dsr(gunluk, liste, liste.length) : null;
  }
  const temel = { olculer: olc, donem: { veriBas: tStr(V.takvim[0]), oosBas: olc ? olc.bas : null, bit: olc ? olc.bit : null, kip: t.kip,
    agirlikKaynak, kirpan: V.kirpan, eksikVeri: t.eksikVeri }, deneme };
  if (ops.hafif) return { ...temel, egri: r.egri, gunluk, sonHedef: r.sonHedef, ortAgirlik: r.ortAgirlik, devirToplam: r.devirToplam, maliyetToplam: r.maliyetToplam, aylar: r.aylar.length };

  ilerle(0.35, 'Ölçüler');
  const sonW = t.yontem === 'elle' ? Object.fromEntries(t.varliklar.map(v => [v.kimlik, v.agirlik])) : (r.sonHedef ? r.sonHedef.w : r.ortAgirlik);
  const agirlikRef = {}; for (const k of V.kollar) agirlikRef[k] = Math.max(r.ortAgirlik[k] || 0, sonW[k] || 0);
  ilerle(0.45, 'Kıyaslar');
  const kiyaslar = [], kiyasEgri = {};
  for (const k of t.kiyaslar) {
    try { const kx = kiyasKos(k, t, r.egri[0].time, r.egri[r.egri.length - 1].time); if (kx.hata) { kiyaslar.push(kx); continue; }
      kiyasEgri[kx.ad] = kx.egri; kiyaslar.push({ ad: kx.ad, kimlik: kx.kimlik, bas: kx.bas, kirpildi: kx.kirpildi, olculer: olculer(kx.egri, rf), egri: ciftDizi(kx.egri) }); }
    catch (e) { kiyaslar.push({ ad: k, hata: e.message }); }
  }
  ilerle(0.55, 'Stres');
  let sabit = null;
  try { sabit = sabitStres(t, sonW); } catch (e) { sabit = { hata: e.message }; }
  ilerle(0.7, 'Bootstrap');
  const bootstrap = gunluk.length > 60 ? { ...OPT.bootstrapAralik(gunluk), not: 'durağan blok bootstrap (b 20 gün, 2000 yol); denetim: düşüş kuyruğunu dar gösterebilir — tarihsel stres ile birlikte okuyun' } : null;
  ilerle(0.78, 'Karşı kip');
  let karsiKip = null;
  if (t.yontem !== 'elle' && !ops.karsiKipYok) {
    try {
      const diger = t.kip === 'gecmis' ? 'walk-forward' : 'gecmis';
      const tt = { ...t, kip: diger, eksikVeri: diger === 'gecmis' ? 'kirp' : t.eksikVeri, _denetlendi: true };
      const s2 = simule(tt, { hafif: true, veri: tt.eksikVeri === t.eksikVeri ? V : undefined });
      // Aynı değerlendirme dönemi: in-sample eğrisi OOS dönemine kesilir (adil kıyas)
      const ortakBas = Math.max(s2.egri[0].time, r.egri[0].time);
      const ayni = (e) => olculer(OPT.dilim(e, ortakBas + 1), rf);   // +1 ms: ortakBas günü başlangıç düzeyi olur
      karsiKip = { kip: diger, olculer: s2.olculer, donem: s2.donem, ayniDonem: { bas: tStr(ortakBas), bu: ayni(r.egri), diger: ayni(s2.egri) },
        sonHedef: s2.sonHedef, aciklama: diger === 'gecmis' ? 'aynı yöntem, ağırlıklar TÜM dönemden (in-sample, ileriye bakışlı)' : 'aynı yöntem, her ay yalnız geçmiş pencereden (örneklem dışı)' };
    } catch (e) { karsiKip = { hata: e.message }; }
  }
  ilerle(0.86, 'Senaryolar');
  let senaryolar = null;
  if (V.kollar.some(k => senaryoAl(k, 'ii'))) {
    senaryolar = {};
    for (const s of Object.keys(SENARYO)) {
      if (s === t.stratejiSenaryosu) { senaryolar[s] = { cagr: olc.cagr, maxDD: olc.maxDD, sharpe: olc.sharpe }; continue; }
      try { const tt = { ...t, stratejiSenaryosu: s, _denetlendi: true }; const s2 = simule(tt, { hafif: true }); senaryolar[s] = { cagr: s2.olculer.cagr, maxDD: s2.olculer.maxDD, sharpe: s2.olculer.sharpe }; }
      catch (e) { senaryolar[s] = { hata: e.message }; }
    }
  }
  ilerle(0.94, 'Rapor');
  const kat = Object.fromEntries(V.kollar.map(k => [k, KAT.varlik(k)]));
  const sonuc = {
    tanim: { ...t, _notlar: undefined, _denetlendi: undefined },
    ...temel,
    egri: ciftDizi(r.egri), dusus: dususEgrisi(r.egri),
    yillik: OPT.olcu(r.egri).yillar.map(y => ({ yil: y.yil, getiri: y.getiri, kismi: y.kismi })),
    aylik: aylikGetiri(r.egri), kayan36: kayan36(r.egri),
    riskKatkisi: OPT.riskKatkisi(r), korelasyon: korelasyon(V.takvim, V.getiri, V.kollar, r.egri[0].time, r.egri[r.egri.length - 1].time),
    agirlikGecmisi: r.aylar.map(a => ({ ay: a.ay, hedef: a.hedef, gercek: a.onceki, islem: a.islem, maliyet: a.maliyet, uygun: a.uygun, not: a.not })),
    sonHedef: r.sonHedef, gecmisAgirlik: gecmisW, gecmisNot, ortAgirlik: r.ortAgirlik,
    devir: { toplam: r.devirToplam, yillik: olc ? r.devirToplam / olc.yilSayisi : null, maliyetToplam: r.maliyetToplam,
      maliyetYillik: olc ? r.maliyetToplam / olc.yilSayisi : null, islemAy: r.aylar.filter(a => a.islem).length, ay: r.aylar.length, ...(r.bantIslemleri ? { bantIslem: r.bantIslemleri.length } : {}) },
    bootstrap,
    stres: { donemler: stresDonemleri(r.egri, kiyasEgri), sabitAgirlik: sabit },
    kiyaslar, karsiKip, senaryolar,
    varliklar: V.kollar.map(k => ({ kimlik: k, ad: kat[k].ad, sinif: kat[k].sinif, altKategori: kat[k].altKategori, hesap: t.varliklar.find(v => v.kimlik === k).hesap,
      paraBirimi: kat[k].paraBirimi, baslangic: tStr(V.basT[k]), seri: V.paket[k].kaynakKimlik, senaryo: V.paket[k].senaryo })),
    notlar: Object.fromEntries(V.kollar.map(k => [k, V.paket[k].notlar])),
    nakitKolu: nakit,
  };
  sonuc.uyarilar = uyarilar(t, { V, r, olc, sabit: sabit && !sabit.hata ? sabit : null, agirlikRef, agirlikSetleri: [r.ortAgirlik, sonW] });
  sonuc.sureMs = Date.now() - t0;
  ilerle(1, 'Tamamlandı');
  return sonuc;
}

// ═══ 9. VARYASYON TARAYICI ════════════════════════════════════════════════════
function adayListesi(adaylar, mevcutKimlikler) {
  let liste;
  if (Array.isArray(adaylar)) liste = adaylar.map(String);
  else if (adaylar && typeof adaylar === 'object') {
    const f = { sinif: adaylar.sinif, hesap: adaylar.hesap, metin: adaylar.metin, etiket: adaylar.etiket, enGecBas: adaylar.enGecBas, enAzGun: adaylar.enAzGun };
    let l = KAT.ara(f);
    if (adaylar.kategori) { const n = s => String(s || '').toLocaleLowerCase('tr'); l = l.filter(v => n(v.altKategori).includes(n(adaylar.kategori))); }
    l = l.filter(v => !(v.etiketler || []).includes('kapandi') && !mevcutKimlikler.includes(v.kimlik));
    l.sort((a, b) => (b.gunSayisi || 0) - (a.gunSayisi || 0));
    liste = l.slice(0, Math.min(adaylar.limit || 30, 100)).map(v => v.kimlik);
  } else throw new Error('varyasyon: adaylar dizi ya da süzgeç nesnesi olmalı');
  liste = [...new Set(liste)].filter(k => !mevcutKimlikler.includes(k));
  if (!liste.length) throw new Error('varyasyon: aday yok');
  if (liste.length > 100) throw new Error('varyasyon: en çok 100 aday');
  return liste;
}
function tanimDegistir(t, eski, yeni) {
  const tt = JSON.parse(JSON.stringify({ ...t, _notlar: undefined, _denetlendi: undefined }));
  tt.varliklar = tt.varliklar.map(v => (v.kimlik === eski ? { ...v, kimlik: yeni, hesap: KAT.varlik(yeni).hesap } : v));
  tt.gruplar = (t.gruplar || []).map(g => ({ ad: g.ad, max: g.max, min: g.min, ...Object.fromEntries(Object.entries(g.secici).filter(([, x]) => x != null)),
    ...(g.secici.kimlikler ? { kimlikler: [].concat(g.secici.kimlikler).map(k => (k === eski ? yeni : k)) } : {}) }));
  return tt;
}
function varyasyon(tanim, ops = {}) {
  const t0 = Date.now();
  const ilerle = ops.ilerleme || (() => {});
  const t = tanimDenetle(tanim);
  const degistir = ops.degistir;
  if (!t.varliklar.find(v => v.kimlik === degistir)) throw new Error(`varyasyon: '${degistir}' tanımda yok`);
  const adaylar = adayListesi(ops.adaylar, t.varliklar.map(v => v.kimlik));
  const ortakDonem = ops.ortakDonem !== false;
  // Ortak dönem: mevcut + tüm adayların ortak başlangıcı (kırp kipinde) — sıralama aynı günlerde yapılır.
  const tanimlar = [{ kimlik: degistir, t }];
  for (const a of adaylar) { try { tanimlar.push({ kimlik: a, t: tanimDenetle(tanimDegistir(t, degistir, a)) }); } catch (e) { tanimlar.push({ kimlik: a, hata: e.message }); } }
  let ortakBas = null, sinirlayan = null;
  const veriler = new Map();
  for (const x of tanimlar) { if (x.hata) continue; try { veriler.set(x.kimlik, veriHazirla(x.t)); } catch (e) { x.hata = e.message; } }
  if (!veriler.has(degistir)) throw new Error('varyasyon: mevcut tanım koşulamadı: ' + tanimlar[0].hata);
  if (ortakDonem) {
    // sinirlayan = dönemi kısan VARLIK (varyasyonun kırpan kolu; ör. GLD), varyasyonun adı değil (L4: eşitlikte mevcut 'QQQ' yazılıyordu)
    for (const [k, v] of veriler) if (ortakBas == null || v.takvim[0] > ortakBas) { ortakBas = v.takvim[0]; sinirlayan = v.kirpan || k; }
    const ortakBit = Math.min(...[...veriler.values()].map(v => v.takvim[v.takvim.length - 1]));
    for (const x of tanimlar) if (!x.hata) { x.t = { ...x.t, donem: { bas: tStr(ortakBas), bit: tStr(ortakBit) } }; try { veriler.set(x.kimlik, veriHazirla(x.t)); } catch (e) { x.hata = e.message; } }
  }
  const satirlar = [];
  let mevcut = null;
  tanimlar.forEach((x, i) => {
    ilerle(0.05 + 0.85 * i / tanimlar.length, `${x.kimlik} (${i + 1}/${tanimlar.length})`);
    const kat = KAT.varMi(x.kimlik) ? KAT.varlik(x.kimlik) : null;
    if (x.hata) { satirlar.push({ kimlik: x.kimlik, ad: kat && kat.ad, hata: x.hata }); return; }
    try {
      const s = simule({ ...x.t, _denetlendi: true }, { hafif: true, veri: veriler.get(x.kimlik) });
      if (!s.olculer) throw new Error('dönem ölçü için çok kısa');
      const satir = { kimlik: x.kimlik, ad: kat.ad, sinif: kat.sinif, altKategori: kat.altKategori, mevcut: i === 0, olculer: s.olculer, donem: s.donem,
        gunlukSharpe: s.deneme.gunlukSharpe, stres: Object.fromEntries(STRES_DONEMLERI.map(d => [d.kod, pencereGetirisi(s.egri, d.bas, d.bit)])),
        egriAylik: aySonlari(s.egri).map(a => [a.time, +a.v.toPrecision(8)]), _egri: s.egri, _r: s.gunluk, sonHedef: s.sonHedef ? s.sonHedef.w : null };
      if (i === 0) mevcut = satir;
      satirlar.push(satir);
    } catch (e) { satirlar.push({ kimlik: x.kimlik, ad: kat && kat.ad, hata: e.message }); }
  });
  if (!mevcut) throw new Error('varyasyon: mevcut tanım koşulamadı');
  ilerle(0.92, 'Deneme sayacı ve DSR');
  // Eşleştirilmiş bootstrap P(aday > mevcut) — aynı günler üzerinde (ortak dönemde birebir hizalı)
  const mHar = new Map(mevcut._egri.slice(1).map((x, i) => [x.time, mevcut._r[i]]));
  for (const s of satirlar) {
    if (s.hata || s.mevcut) continue;
    const cift = []; s._egri.slice(1).forEach((x, i) => { if (mHar.has(x.time)) cift.push([s._r[i], mHar.get(x.time)]); });
    s.pMevcuttanIyi = cift.length > 60 ? nq().bootstrapP(cift, { N: ops.bootstrapN || 1000 }) : null;
    s.fark = { cagr: s.olculer.cagr - mevcut.olculer.cagr, maxDD: s.olculer.maxDD - mevcut.olculer.maxDD, sharpe: s.olculer.sharpe - mevcut.olculer.sharpe };
  }
  const anahtar = ops.sirala || 'sharpe';
  const deger = s => (s.hata ? -Infinity : anahtar === 'maxDD' ? -s.olculer.maxDD : (s.olculer[anahtar] != null ? s.olculer[anahtar] : -Infinity));
  satirlar.sort((a, b) => deger(b) - deger(a));
  const yeniSharpeler = satirlar.filter(s => !s.hata).map(s => s.gunlukSharpe);
  const tum = [...(ops.oncekiSharpeler || []), ...yeniSharpeler];
  const enIyi = satirlar.find(s => !s.hata);
  const dsr = tum.length >= 2 ? nq().dsr(enIyi._r, tum, tum.length) : null;
  const sansUyarisi = [];
  const dsrY = dsr != null ? dsr.toFixed(3).replace('.', ',') : '';
  if (dsr != null && dsr < 0.95) sansUyarisi.push(enIyi.mevcut
    ? `Hiçbir aday mevcut portföyü (${enIyi.kimlik}) geçmedi. Ama ${tum.length} denemeden sonra mevcudun da Deflated Sharpe'ı ${dsrY} (< 0,950): bu oturumdaki deneme sayısı ve dağılımı düşünülünce onun Sharpe'ı da ŞANSTAN ayırt edilemiyor.`
    : `En iyi aday (${enIyi.kimlik}) büyük olasılıkla ŞANSLI: ${tum.length} denemeden sonra Deflated Sharpe ${dsrY} (< 0,950). Bu sıralama gelecekte tekrarlanmayabilir.`);
  if (enIyi && !enIyi.mevcut && enIyi.pMevcuttanIyi != null && enIyi.pMevcuttanIyi < 0.9) sansUyarisi.push(`En iyi adayın mevcuttan iyi olma olasılığı (eşleştirilmiş bootstrap) ${(enIyi.pMevcuttanIyi * 100).toFixed(0)}% — fark istatistiksel olarak belirsiz.`);
  if (t.kip === 'gecmis' && t.yontem !== 'elle') sansUyarisi.push('Varyasyonlar geçmiş (in-sample) kipte koşuldu — sıralama iyimser.');
  for (const s of satirlar) { delete s._egri; delete s._r; }
  const V0 = veriler.get(degistir);
  return {
    degistir, mevcut: { kimlik: degistir, olculer: mevcut.olculer }, satirlar, siralama: anahtar,
    donem: { ortak: ortakDonem, bas: tStr(V0.takvim[0]), bit: tStr(V0.takvim[V0.takvim.length - 1]), sinirlayan: ortakDonem ? sinirlayan : null },
    yeniDeneme: yeniSharpeler.length, yeniSharpeler, denemeSayisi: tum.length, dsr, sansUyarisi,
    aciklama: 'DSR (Bailey & López de Prado 2014, lib/research/nasdaq.js dsr): en iyi adayın günlük Sharpe\'ı, bu oturumdaki TÜM denemelerin Sharpe dağılımına ve deneme sayısına göre düzeltilir; sıfırı (al-tut değil) yenme olasılığıdır.',
    sureMs: Date.now() - t0,
  };
}

// ═══ 10. UYGULAMA PLANI ═══════════════════════════════════════════════════════
function guncelHedef(tanim) {
  const t = tanimDenetle(tanim);
  if (t.yontem === 'elle') return { ay: null, w: Object.fromEntries(t.varliklar.map(v => [v.kimlik, v.agirlik])), kaynak: 'elle', tanim: t };
  if (t.kip === 'gecmis') {
    const k = kos(t, veriHazirla(t));
    return { ay: null, w: k.gecmisW, kaynak: 'geçmiş kip (in-sample) ağırlığı', tanim: t };
  }
  const s = simule({ ...t, _denetlendi: true }, { hafif: true });
  return { ay: s.sonHedef.ay, w: s.sonHedef.w, kaynak: `walk-forward son hedef (${s.sonHedef.ay} ay başı, son ${t.pencereAy} ay)`, tanim: t };
}
/** Varlığın son fiyatı (yerel para) — adet ↔ tutar için. Strateji / mevduat / nakit için null. */
function sonFiyat(kimlik) {
  const v = KAT.varlik(kimlik);
  if (!['yahoo', 'tefas', 'kripto'].includes(v.kaynakTur)) return null;
  if (v.kaynakTur === 'tefas' && v.durum !== 'hazir') require('./indir').tefasKur([v.ek.kod]);
  const K = require('./kaynaklar');
  const s = K.KAYNAKLAR[v.kaynakTur].seviye(v, { tefasHizalama: 'islem' });
  const x = s.satirlar[s.satirlar.length - 1];
  return { fiyat: x.v, para: s.para, tarih: tStr(x.t), not: v.kaynakTur === 'yahoo' ? 'Yahoo düzeltilmiş kapanış (son gün = kapanış)' : null };
}
function sonrakiDengeleme(siklik, bugunT) {
  const aylar = SIKLIK[siklik]; if (!aylar.length) return null;
  const d = new Date(bugunT);
  for (let k = 1; k <= 13; k++) {
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1);
    if (aylar.includes(new Date(t).getUTCMonth())) { let g = t; while ([0, 6].includes(new Date(g).getUTCDay())) g += GUN; return tStr(g); }
  }
  return null;
}
function plan(tanim, ops = {}) {
  const H = guncelHedef(tanim);
  const t = H.tanim;
  const usdtry = pv().usdtry(); const kur = usdtry[usdtry.length - 1];
  const notlar = [];
  const fiyatlar = new Map();
  const fiyatAl = k => { if (!fiyatlar.has(k)) { let f = null; try { f = sonFiyat(k); } catch (e) { notlar.push(`${k}: fiyat okunamadı (${e.message})`); } fiyatlar.set(k, f); } return fiyatlar.get(k); };
  const usdFiyat = f => (f ? (f.para === 'TRY' ? f.fiyat / kur.c : f.para === 'USD' ? f.fiyat : null) : null);
  // Mevcut pozisyonlar → USD
  const poz = (ops.mevcut || []).map((p, i) => {
    if (!p || !p.kimlik) throw new Error(`plan: mevcut[${i}].kimlik yok`);
    const v = KAT.varlik(p.kimlik);
    let usd;
    if (p.tutarUSD != null) usd = Number(p.tutarUSD);
    else if (p.tutarTL != null) usd = Number(p.tutarTL) / kur.c;
    else if (p.adet != null) { const f = usdFiyat(fiyatAl(p.kimlik)); if (f == null) throw new Error(`plan: ${p.kimlik} için adet → tutar çevrilemez (fiyat yok); tutarUSD ya da tutarTL verin`); usd = Number(p.adet) * f; }
    else throw new Error(`plan: mevcut[${i}] tutarUSD | tutarTL | adet gerekli`);
    if (!Number.isFinite(usd) || usd < 0) throw new Error(`plan: mevcut[${i}] tutar geçersiz`);
    return { kimlik: p.kimlik, hesap: p.hesap || (t.varliklar.find(x => x.kimlik === p.kimlik) || {}).hesap || v.hesap, usd };
  });
  let nakit = ops.nakit || 0;
  const nakitHesap = typeof nakit === 'number' ? (nakit ? { serbest: nakit } : {}) : { ...nakit };
  const nakitTop = Object.values(nakitHesap).reduce((a, b) => a + Number(b || 0), 0);
  const toplam = poz.reduce((a, p) => a + p.usd, 0) + nakitTop;
  if (!(toplam > 0)) throw new Error('plan: toplam varlık 0');
  const mevcutK = new Map(); for (const p of poz) mevcutK.set(p.kimlik, (mevcutK.get(p.kimlik) || 0) + p.usd);
  const tum = [...new Set([...Object.keys(H.w), ...mevcutK.keys()])];
  let enBuyuk = { kimlik: null, sapma: 0 };
  const satir = tum.map(k => {
    const hedefW = H.w[k] || 0, m = mevcutK.get(k) || 0, sapma = m / toplam - hedefW;
    if (Math.abs(sapma) > Math.abs(enBuyuk.sapma)) enBuyuk = { kimlik: k, sapma };
    return { kimlik: k, hedefW, mevcutUSD: m, mevcutW: m / toplam, hedefUSD: hedefW * toplam, farkUSD: hedefW * toplam - m, sapma };
  });
  const bant = t.dengeleme.bant;
  const nakitPay = nakitTop / toplam;
  const islemGerekmez = !ops.zorla && Math.abs(enBuyuk.sapma) <= bant && nakitPay <= bant;
  const minIslem = ops.minIslemUSD == null ? 10 : Number(ops.minIslemUSD);
  const islemler = [];
  if (!islemGerekmez) {
    for (const s of satir) {
      if (Math.abs(s.farkUSD) < minIslem) continue;
      const v = KAT.varlik(s.kimlik);
      const hesap = (s.farkUSD < 0 ? (poz.find(p => p.kimlik === s.kimlik) || {}).hesap : null) || (t.varliklar.find(x => x.kimlik === s.kimlik) || {}).hesap || v.hesap;
      const f = fiyatAl(s.kimlik), fu = usdFiyat(f);
      islemler.push({ hesap, kimlik: s.kimlik, ad: v.ad, islem: s.farkUSD > 0 ? 'AL' : 'SAT', tutarUSD: Math.abs(s.farkUSD),
        adet: fu ? Math.abs(s.farkUSD) / fu : null, fiyat: f ? { deger: f.fiyat, para: f.para, tarih: f.tarih } : null,
        tutarTL: v.paraBirimi === 'TRY' ? Math.abs(s.farkUSD) * kur.c : null, hedefW: s.hedefW, mevcutW: s.mevcutW,
        not: v.hesap === 'yok' ? 'doğrudan alınamaz (endeks/vadeli) — ETF/fon karşılığıyla uygulanmalı' : (v.sinif === 'strateji' ? 'strateji kolu: bot hesabına sermaye ayırma' : null) });
    }
    islemler.sort((a, b) => (a.islem === b.islem ? b.tutarUSD - a.tutarUSD : a.islem === 'SAT' ? -1 : 1));
  }
  // Hesap özetleri ve transfer önerileri
  const hesaplar = new Map();
  const hs = h => { if (!hesaplar.has(h)) hesaplar.set(h, { hesap: h, mevcutUSD: 0, nakitUSD: 0, satisUSD: 0, alisUSD: 0 }); return hesaplar.get(h); };
  for (const p of poz) hs(p.hesap).mevcutUSD += p.usd;
  for (const [h, v] of Object.entries(nakitHesap)) hs(h).nakitUSD += Number(v || 0);
  for (const x of islemler) { if (x.islem === 'AL') hs(x.hesap).alisUSD += x.tutarUSD; else hs(x.hesap).satisUSD += x.tutarUSD; }
  const hList = [...hesaplar.values()].map(h => ({ ...h, netIhtiyacUSD: h.alisUSD - h.satisUSD - h.nakitUSD, hedefUSD: 0 }));
  for (const s of satir) { const h = (t.varliklar.find(x => x.kimlik === s.kimlik) || {}).hesap || KAT.varlik(s.kimlik).hesap; const e = hList.find(x => x.hesap === h); if (e) e.hedefUSD += s.hedefUSD; else hList.push({ hesap: h, mevcutUSD: 0, nakitUSD: 0, satisUSD: 0, alisUSD: 0, netIhtiyacUSD: 0, hedefUSD: s.hedefUSD }); }
  const fazla = hList.filter(h => h.netIhtiyacUSD < -0.5).map(h => ({ h: h.hesap, v: -h.netIhtiyacUSD }));
  const eksik = hList.filter(h => h.netIhtiyacUSD > 0.5).map(h => ({ h: h.hesap, v: h.netIhtiyacUSD }));
  const transferler = [];
  for (const e of eksik) for (const f of fazla) { if (e.v <= 0.5) break; if (f.v <= 0.5) continue; const m = Math.min(e.v, f.v); transferler.push({ kaynak: f.h, hedef: e.h, tutarUSD: m, tutarTL: (f.h === 'tr-banka' || f.h === 'tefas' || e.h === 'tr-banka' || e.h === 'tefas') ? m * kur.c : null }); e.v -= m; f.v -= m; }
  let maliyetTahmini;
  const devir = islemler.reduce((a, x) => a + x.tutarUSD, 0);
  if (typeof t.maliyet === 'number') maliyetTahmini = t.maliyet * devir;
  else maliyetTahmini = t.maliyet.islem * devir + t.maliyet.hesaplarArasi * transferler.reduce((a, x) => a + x.tutarUSD, 0);
  if (H.kaynak.startsWith('geçmiş')) notlar.push('UYARI: hedef in-sample (geçmiş kip) ağırlıklarından — ileriye bakışlı');
  return {
    hedef: { ay: H.ay, kaynak: H.kaynak, w: H.w }, toplamUSD: toplam, nakitUSD: nakitTop, bant, islemGerekmez,
    enBuyukSapma: enBuyuk, durum: islemGerekmez ? `İşlem gerekmez: en büyük sapma ${yz(Math.abs(enBuyuk.sapma))} ≤ bant ${yz(bant)}` : null,
    satirlar: satir, islemler, hesaplar: hList, transferler, devirUSD: devir, maliyetTahmini,
    sonrakiDengeleme: sonrakiDengeleme(t.dengeleme.siklik, O.bugunT()), kur: { USDTRY: kur.c, tarih: tStr(kur.t) }, notlar,
    olusturma: new Date(O.ortamAl().simdi()).toISOString(),
  };
}

module.exports = { simule, varyasyon, plan, guncelHedef, tanimDenetle, veriHazirla, sonFiyat, vekilSec, sabitStres, pencereGetirisi, STRES_DONEMLERI,
  YONTEMLER: Object.keys(YONTEMLER), SIKLIKLAR: Object.keys(SIKLIK), _ic: { kos, hizala, kayan36, aylikGetiri, korelasyon, maliyetKur, ilkAyBasi, tlTasima, sonrakiDengeleme } };
