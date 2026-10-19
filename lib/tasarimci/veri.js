/**
 * PORTFÖY TASARIMCISI — CANLI VERİ BAĞDAŞTIRICISI. PLAN-PORTFOY-TASARIMCI.md (d) `veri`.
 * Öz test: node scripts/tasarimci-selftest.js · mutabakat: node scripts/tasarimci-mutabakat.js
 *
 * Strateji çekirdekleri (stratejiler/*.js) fiyatı DOSYA YOLUYLA değil bu modülden okur. İki öncelik kipi:
 *   'canli'     (varsayılan) orkestratörün tazelediği kopya önce, ölçüm girdisi yedek:
 *                 ABD   data/portfoy/yahoo → data/nasdaq
 *                 BIST  data/portfoy/yahoo-bist → data/portfoy/yahoo → data/bist
 *                 ^IRX  data/portfoy/yahoo/_IRX.json → data/qqq-yenmek/irx.json
 *                 USDTRY data/portfoy/USDTRY_X.json → data/portfoy/yahoo-bist → data/bist
 *   'arastirma' ölçüm betiklerinin okuduğu dosyalar önce (mutabakat: qqq-momentum.js / bist-yenmek-momentum.js ile birebir).
 * Araştırma girdileri (data/nasdaq, data/bist, data/qqq-yenmek) bu modül tarafından HİÇ yazılmaz.
 *
 * API
 *   ortam({ veriKok?, oncelik? }) → önceki ortam (test / mutabakat). veriKok vars. null = Pusula veri yeri (lib/yollar.js).
 *   dosyaBul(sembol) → { dosya, dizin } | null      ham(sembol) → Yahoo dosyası { gunler:[{t,o,h,l,c,ac,v}], indirme, … }
 *   seriVarMi(sembol)
 *   duzeltilmis(sembol) → [{ t, o, h, l, c, ham, v, dolar, k }]  — lib/research/nasdaqVeri.js duzeltilmis ile AYNI dönüşüm
 *        (k = ac/c; o,h,l × k; c = ac; boş açılış → önceki düzeltilmiş kapanış, ov). Döndürülen diziyi DEĞİŞTİRME.
 *   nyseGunleri() → [ms]  ^GSPC kapanış günleri (nasdaqVeri.takvim ile aynı tanım; takvim.js ile öz testte birebir)
 *   irx() → [{ t, c }]  (^IRX yüzde)      usdtry() → [{ t, c }]
 *   tcmbFaiz() → { seri:[{ t, tarih, oran }], kaynak, sonKayit, uyari }  data/bist/tcmb-politika-faizi.json (yoksa git kopyası
 *        kayitlar/tasarim/veri/; + isteğe bağlı
 *        elle ek data/tasarimci/tcmb-faiz-ek.json [{ tarih, oran }] — politika faizi için ücretsiz anahtarsız kaynak yok)
 *   sonTamGun(sembol, borsa) → 'YYYY-MM-DD' | null  (indirme o günün kapanış + yayın saatinden önceyse ya da dosyada indirme
 *        alanı YOKSA önceki gün — son mumun tamamlandığı kanıtlanamaz)
 *   tazelik({ simdi?, semboller? }) → { simdi, satirlar:[{ sembol, borsa, dizin, sonGun, beklenen, eksikGun, bayat }], bayat }
 *        beklenen = yayın saati (NYSE 18:00 New York, BIST 19:00 İstanbul) geçmiş son işlem günü (takvim.js).
 *   onbellekTemizle()
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const T = require('./takvim');

const PROJE = path.join(__dirname, '..', '..');
const _ortam = { veriKok: null, oncelik: 'canli' };   // veriKok null = Pusula veri yeri (lib/yollar.js); test düz klasör verir
/** Veri kökü altındaki göreli yol (varsayılan: lib/yollar.js tür alt klasörleri; testte düz veriKok). */
const veriYolu = (...p) => (_ortam.veriKok ? path.join(_ortam.veriKok, ...p) : yollar.veri(...p));
function ortam(yeni) { const eski = { ..._ortam }; if (yeni) { Object.assign(_ortam, yeni); onbellekTemizle(); } return eski; }
const D = () => {
  const k = veriYolu;
  return { yahoo: k('portfoy', 'yahoo'), yahooBist: k('portfoy', 'yahoo-bist'), nasdaq: k('nasdaq'), bist: k('bist'),
    qqqYenmek: k('qqq-yenmek'), portfoy: k('portfoy'), tasarimci: k('tasarimci') };
};
const dosyaAdi = s => String(s).replace(/[^A-Z0-9.]/gi, '_') + '.json';
const bistMi = s => /\.IS$/i.test(s) || /^USDTRY/i.test(s);
function dizinSirasi(sembol) {
  const d = D(), canli = _ortam.oncelik !== 'arastirma';
  if (bistMi(sembol)) return canli ? [['yahoo-bist', d.yahooBist], ['yahoo', d.yahoo], ['bist', d.bist]] : [['bist', d.bist], ['yahoo-bist', d.yahooBist], ['yahoo', d.yahoo]];
  return canli ? [['yahoo', d.yahoo], ['nasdaq', d.nasdaq]] : [['nasdaq', d.nasdaq], ['yahoo', d.yahoo]];
}
const imza = p => { try { const s = fs.statSync(p); return `${Math.round(s.mtimeMs)}:${s.size}`; } catch (e) { return null; } };

const _ham = new Map(), _duz = new Map();
let _nyse = null;
function onbellekTemizle() { _ham.clear(); _duz.clear(); _nyse = null; }

function dosyaBul(sembol) {
  for (const [dizin, dir] of dizinSirasi(sembol)) { const p = path.join(dir, dosyaAdi(sembol)); if (fs.existsSync(p)) return { dosya: p, dizin }; }
  return null;
}
const seriVarMi = s => !!dosyaBul(s);
/**
 * Öncelikli dosya geçmişin TAMAMINI taşımıyorsa (ör. orkestratörün yarım/kesik indirmesi: data/portfoy/yahoo/WBD.json tek gün)
 * sonraki dosya taban alınır; öncelikli dosyanın tabanın son gününden SONRAKİ günleri, örtüşen son günün oranıyla (ac ve c
 * ayrı ayrı) ölçeklenip eklenir. Örtüşme yoksa yalnız taban. Getiri oranları ölçekten bağımsız → seçim/metrik değişmez.
 */
function ham(sembol) {
  const adaylar = dizinSirasi(sembol).map(([dizin, dir]) => ({ dizin, dosya: path.join(dir, dosyaAdi(sembol)) })).filter(x => fs.existsSync(x.dosya));
  if (!adaylar.length) throw new Error(`tasarimci/veri: ${sembol} verisi yok (${dizinSirasi(sembol).map(x => x[0]).join(' → ')}) — sunucuda: npm run tasarimci:hazirla`);
  const anahtar = adaylar.map(x => x.dosya + '@' + imza(x.dosya)).join('|');
  const o = _ham.get(sembol);
  if (o && o.anahtar === anahtar) return o.v;
  const oku = x => { const j = JSON.parse(fs.readFileSync(x.dosya, 'utf8')); j.gunler = (j.gunler || []).filter(g => g.c > 0); return j; };
  const A = oku(adaylar[0]);
  let v = A, aciklama = adaylar[0].dizin;
  if (adaylar.length > 1 && _ortam.oncelik !== 'arastirma') {   // araştırma kipinde ölçüm girdisi tek otoritedir
    const B = oku(adaylar[1]);
    const aIlk = A.gunler.length ? A.gunler[0].t : Infinity, bIlk = B.gunler.length ? B.gunler[0].t : Infinity;
    if (B.gunler.length && aIlk > bIlk + 10 * 864e5) {
      const bSon = B.gunler[B.gunler.length - 1].t;
      const bT = new Map(B.gunler.map(h => [h.t, h]));
      const ortak = A.gunler.filter(g => g.t <= bSon && bT.has(g.t)).pop();
      let gunler = B.gunler.slice();
      if (ortak) {
        const h = bT.get(ortak.t), ka = h.ac / ortak.ac, kc = h.c / ortak.c;
        if (isFinite(ka) && isFinite(kc)) gunler = gunler.concat(A.gunler.filter(g => g.t > bSon).map(g => ({ ...g, c: g.c * kc, ac: g.ac * ka, o: g.o * kc, h: g.h * kc, l: g.l * kc })));
      }
      v = { ...B, gunler, indirme: ortak ? A.indirme : B.indirme };
      aciklama = `${adaylar[1].dizin} (+ ${adaylar[0].dizin} ${ortak ? 'sonrası ölçekli eklendi' : 'örtüşmüyor, kullanılmadı'}; ${adaylar[0].dizin} geçmişi eksik)`;
    }
  }
  v._dosya = adaylar[0].dosya; v._dizin = aciklama;
  _ham.set(sembol, { anahtar, v });
  return v;
}

/** nasdaqVeri.duzeltilmis ile BİREBİR (hacimSifirAt yok). */
function duzeltDonustur(gunler) {
  const out = [];
  for (const x of gunler) {
    if (!(x.c > 0) || !(x.ac > 0)) continue;
    const k = x.ac / x.c, onceki = out.length ? out[out.length - 1].c : null;
    const r = { t: x.t, o: x.o * k, h: x.h * k, l: x.l * k, c: x.ac, ham: x.c, v: x.v || 0, dolar: x.c * (x.v || 0), k };
    if (!(x.o > 0)) { r.o = onceki != null ? onceki : r.c; r.ov = true; }
    if (!(x.h > 0) || !(x.l > 0)) { r.h = Math.max(r.o, r.c); r.l = Math.min(r.o, r.c); r.ov = true; }
    out.push(r);
  }
  return out;
}
function duzeltilmis(sembol) {
  const v = ham(sembol);
  const o = _duz.get(sembol);
  if (o && o.v === v) return o.d;
  const d = duzeltDonustur(v.gunler);
  _duz.set(sembol, { v, d });
  return d;
}
function nyseGunleri() {
  if (!_nyse) _nyse = ham('^GSPC').gunler.filter(x => x.c > 0).map(x => x.t);
  return _nyse;
}

function ilkVar(adaylar) { for (const [ad, p] of adaylar) if (fs.existsSync(p)) return { ad, p }; return null; }
function irx() {
  const d = D(), canli = _ortam.oncelik !== 'arastirma';
  const a = [['yahoo', path.join(d.yahoo, '_IRX.json')], ['qqq-yenmek', path.join(d.qqqYenmek, 'irx.json')]];
  const b = ilkVar(canli ? a : [a[1], a[0]]);
  if (!b) throw new Error('tasarimci/veri: ^IRX verisi yok — sunucuda: npm run tasarimci:hazirla');
  return JSON.parse(fs.readFileSync(b.p, 'utf8')).gunler.filter(x => x.c != null && isFinite(x.c)).map(x => ({ t: x.t, c: x.c }));
}
function usdtry() {
  const d = D(), canli = _ortam.oncelik !== 'arastirma';
  const a = [['portfoy', path.join(d.portfoy, 'USDTRY_X.json')], ['yahoo-bist', path.join(d.yahooBist, 'USDTRY_X.json')], ['bist', path.join(d.bist, 'USDTRY_X.json')]];
  const b = ilkVar(canli ? a : [a[2], a[1], a[0]]);
  if (!b) throw new Error('tasarimci/veri: USDTRY verisi yok — sunucuda: npm run tasarimci:hazirla');
  return JSON.parse(fs.readFileSync(b.p, 'utf8')).gunler.filter(x => x.c > 0).map(x => ({ t: x.t, c: x.c }));
}
function tcmbFaiz() {
  // data/bist (ölçüm girdisi) yoksa git'teki kopya (kayitlar/tasarim/veri — 2026-10-06 çekilen TCMB tablosu, aynı dosya).
  const d = D(), p = [path.join(d.bist, 'tcmb-politika-faizi.json'), path.join(PROJE, 'kayitlar', 'tasarim', 'veri', 'tcmb-politika-faizi.json')].find(x => fs.existsSync(x));
  if (!p) throw new Error('tasarimci/veri: TCMB politika faizi yok (data/bist/tcmb-politika-faizi.json, kayitlar/tasarim/veri/)');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const seri = j.seri.map(x => ({ t: x.t, tarih: x.tarih, oran: x.oran }));
  const ek = path.join(d.tasarimci, 'tcmb-faiz-ek.json');
  let ekSay = 0;
  if (fs.existsSync(ek)) {
    for (const x of JSON.parse(fs.readFileSync(ek, 'utf8'))) {
      const t = T.ms(x.tarih);
      if (t > seri[seri.length - 1].t && x.oran >= 0 && x.oran < 2) { seri.push({ t, tarih: T.iso(t), oran: x.oran }); ekSay++; }
    }
  }
  const son = seri[seri.length - 1];
  return { seri, kaynak: j.kaynak + (ekSay ? ` + elle ek ${ekSay} kayıt (data/tasarimci/tcmb-faiz-ek.json)` : ''), sonKayit: son,
    uyari: `politika faizi ${son.tarih} %${(son.oran * 100).toFixed(1).replace('.', ',')} kaydıyla bitiyor; sonrası ileri taşınır (değişiklik varsa data/tasarimci/tcmb-faiz-ek.json'a elle eklenir)` };
}

// ── Tazelik ─────────────────────────────────────────────────────────────────
const YAYIN = { NYSE: { tz: 'America/New_York', saat: 18 }, BIST: { tz: 'Europe/Istanbul', saat: 19 } };
const ork = () => require('../veri/orkestrator');
const yayinAni = (gunMs, borsa) => { const d = new Date(gunMs); return ork().yereldenUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), YAYIN[borsa].saat, 0, YAYIN[borsa].tz); };
/** Yayın saati geçmiş son işlem günü. */
function beklenenGun(borsa, simdi = Date.now()) {
  let g = T.islemGunuMu(simdi, borsa) ? T.ms(simdi) : T.oncekiIslemGunu(simdi, borsa);
  if (yayinAni(g, borsa) > simdi) g = T.oncekiIslemGunu(g, borsa);
  return g;
}
function sonTamGun(sembol, borsa = bistMi(sembol) ? 'BIST' : 'NYSE') {
  if (!seriVarMi(sembol)) return null;
  const v = ham(sembol), g = v.gunler.filter(x => x.c > 0);
  if (!g.length) return null;
  const son = g[g.length - 1].t, ind = Date.parse(v.indirme || '');
  // indirme zamanı yoksa son mumun tamamlandığı KANITLANAMAZ → son mum sayılmaz (karar veriTam false; F1 denetim bulgusu).
  if (!Number.isFinite(ind) || ind < yayinAni(son, borsa)) return g.length > 1 ? T.iso(g[g.length - 2].t) : null;
  return T.iso(son);
}
const VARSAYILAN_TAZELIK = [['^GSPC', 'NYSE'], ['QQQ', 'NYSE'], ['^IRX', 'NYSE'], ['XU030.IS', 'BIST'], ['USDTRY=X', 'BIST']];
function tazelik({ simdi = Date.now(), semboller = VARSAYILAN_TAZELIK } = {}) {
  const satirlar = [];
  for (const [s, borsa] of semboller) {
    const bek = beklenenGun(borsa, simdi);
    let sonGun = null, dizin = null;
    try {
      if (s === '^IRX') { const x = irx(); sonGun = T.iso(x[x.length - 1].t); dizin = _ortam.oncelik !== 'arastirma' && fs.existsSync(path.join(D().yahoo, '_IRX.json')) ? 'yahoo' : 'qqq-yenmek'; }
      else if (/^USDTRY/.test(s)) { const x = usdtry(); sonGun = T.iso(x[x.length - 1].t); dizin = 'usdtry'; }
      else { sonGun = sonTamGun(s, borsa); const b = dosyaBul(s); dizin = b ? b.dizin : null; }
    } catch (e) { sonGun = null; }
    const eksikGun = sonGun ? T.islemGunleri(T.ms(sonGun) + T.GUN, bek, borsa).length : null;
    satirlar.push({ sembol: s, borsa, dizin, sonGun, beklenen: T.iso(bek), eksikGun, bayat: sonGun == null || eksikGun > 0 });
  }
  return { simdi: new Date(simdi).toISOString(), satirlar, bayat: satirlar.some(x => x.bayat) };
}

module.exports = {
  ortam, ortamAl: () => ({ ..._ortam }), veriYolu, dizinler: D, dosyaAdi, dosyaBul, seriVarMi, ham, duzeltilmis, duzeltDonustur, nyseGunleri,
  irx, usdtry, tcmbFaiz, sonTamGun, beklenenGun, tazelik, onbellekTemizle, bistMi,
};
