/**
 * NASDAQ MOMENTUM 10 (830, model m-qqq-m10) — CANLI ÇEKİRDEK. PLAN-PORTFOY-TASARIMCI.md (b), kayitlar/tasarim/t1-s1.json.
 * Mutabakat: node scripts/tasarimci-mutabakat.js (her ay sonu listesi scripts/qqq-momentum.js ile birebir; metrikler ±0,05).
 *
 * KURAL (scripts/qqq-momentum.js `secim` / `kararM10` / `simule` BİREBİR — betik değiştirilmedi, yalnız buraya taşındı):
 *   Her ay son NYSE işlem günü kapanışında o ayın PIT Nasdaq-100 üyeleri (uyelik.uyeler(t), gecerliler) içinde 12-1 getirisi
 *   (t−12 ay sonu → t−1 ay sonu düzeltilmiş kapanış) en yüksek 10 hisse, her biri 1/10; ertesi işlem günü AÇILIŞINDA tam
 *   dengeleme; kayma %0,05 el değiştiren nominalde; nakit ^IRX/100/252 (d−1 oranı), negatif nakit IRX + %1,5.
 *   Uygunluk: ≥ 13 tam ay geçmiş (ilk çubuk ≤ t−13. ay sonu), son çubuk karar gününden ≤ 10 takvim günü önce, t−12 ve t−1
 *   kapanışları kendi aylarında. Eşitlikte sembol sırası. İlk karar (2004-12-31) üyeliği boşsa 2005-01 listesi.
 *   Listeden çıkan hisse ay sonu dengelemesine kadar tutulur; verisi biten → son kapanıştan (kayma) nakde.
 *
 * CANLI FARK (yalnız takvim): ölçüm betiği "ay geçişi"ni veriden görür (son veri günü = ay sonu sayılır, karar orada
 * verilmez). Burada son veri gününün ay sonu olup olmadığı lib/tasarimci/takvim.js'ten okunur — ay sonu günü verisi gelince
 * karar o akşam verilebilir. Geçmiş günlerde iki tanım öz testle birebir aynı (takvim = ^GSPC günleri).
 *
 * API
 *   hazirla({ sonT? }) → D (veri.js + uyelik.js'ten; sonT verilirse o günden sonraki fiyat görülmez)
 *   secim(D, d, ilkKarar, { ay? }) → { liste:[{ s, p }], aday, uyeAy, uyeSay, eksikVeri:[{ s, neden }], tum (tüm sıralama) }
 *        eksikVeri: o ayın üyesi olup verisi OLMAYAN ya da BAYAT (son çubuk karar gününden > 10 gün önce) hisseler. Seçim kuralı
 *        değişmedi (ölçümde de atlanır; karar yalnız verili adaylarla) — ama canlı kararda kayda ve "Bu ay"a uyarı düşer
 *        (ör. endekse yeni giren, henüz indirilmemiş hisse). < 13 ay geçmiş kural gereği aday değildir, eksikVeri'ye girmez.
 *   ayGecis(D, d) · kararM10(D, d0, { kayit }) · kararAlTut() · simule(D, { karar, d0, dSon, seriler })
 *   kos(D, { dSon? }) → { d0, at, m10 }  (QQQ al-tut kıyası + M10; m10.kayit = her ay sonu listesi)
 *   olc(egri) → { gel, hol, tum }  (lib/research/nasdaq.js metrik; geliştirme < 2016-01-01 ≤ holdout)
 *   hedef(D, kararGunu) → { kararGunu, uygulamaGunu, liste, agirlik, veriTam, aday, eksikVeri, uyelik }  canlı ay sonu hedefi (karar günü ay sonu
 *        değilse hata; veriTam = ^GSPC'nin o günkü kapanışı tamamlanmış mı — değilse zamanlayıcı kararı dondurmamalı)
 */
'use strict';
const path = require('path');
const V = require('../veri');
const UY = require('../uyelik');
const T = require('../takvim');
const N = require(path.join(__dirname, '..', '..', 'research', 'nasdaq'));

const GUN = 864e5, KAYMA = 0.0005, MARJ_EK = 0.015, K = 10;
const BAS = Date.UTC(2005, 0, 1), HOL = Date.UTC(2016, 0, 1);
const tarih = t => new Date(t).toISOString().slice(0, 10);
const ayNo = t => { const x = new Date(t); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };
const seriHazirla = (ad, satirlar, tk) => { const { bar, sonIdx } = hizala(satirlar, tk); return { s: ad, satir: satirlar, bar, sonIdx, sonT: satirlar.length ? satirlar[satirlar.length - 1].t : -Infinity, k: satirlar.map(x => x.c) }; };
function hizala(satirlar, tk) {
  const D = tk.length, bar = new Array(D).fill(null), sonIdx = new Int32Array(D).fill(-1);
  let k = -1, j = 0;
  for (let d = 0; d < D; d++) { while (j < satirlar.length && satirlar[j].t <= tk[d]) { if (satirlar[j].t === tk[d]) bar[d] = satirlar[j]; k = j; j++; } sonIdx[d] = k; }
  return { bar, sonIdx };
}
function sonOnce(satir, T_) { let lo = 0, hi = satir.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (satir[m].t <= T_) { r = m; lo = m + 1; } else hi = m - 1; } return r; }

function hazirla({ sonT = Infinity } = {}) {
  const tk = V.nyseGunleri().filter(t => t <= sonT);
  const irx = V.irx().filter(x => x.t <= sonT);
  const irxGun = new Float64Array(tk.length); let j = -1;
  for (let d = 0; d < tk.length; d++) { while (j + 1 < irx.length && irx[j + 1].t <= tk[d]) j++; irxGun[d] = j >= 0 ? irx[j].c : 0; }
  const kes = s => (sonT === Infinity ? V.duzeltilmis(s) : V.duzeltilmis(s).filter(x => x.t <= sonT));
  const Q = seriHazirla('QQQ', kes('QQQ'), tk);
  const aySon = new Map();
  for (let d = 0; d < tk.length; d++) aySon.set(ayNo(tk[d]), d);
  const _seri = new Map();
  const seri = s => { if (!_seri.has(s)) _seri.set(s, V.seriVarMi(s) ? seriHazirla(s, kes(s), tk) : null); return _seri.get(s); };
  return { tk, irxGun, Q, ayNo, aySon, seri, uyeler: t => UY.uyeler(t), irxSon: irx.length ? tarih(irx[irx.length - 1].t) : null };
}

/** Ay geçişi: tk[d+1] başka ayda; son veri gününde takvim.js (ölçüm betiği burada her zaman true der ama karar vermez). */
function ayGecis(D, d) {
  const { tk } = D;
  if (d < tk.length - 1) return ayNo(tk[d + 1]) !== ayNo(tk[d]);
  return T.aySonuMu(tk[d], 'NYSE');
}

function secim(D, d, ilkKarar = false, { ay = null } = {}) {
  // ay: aday havuzu önizlemesi (lib/tasarimci/adayHavuzu.js) — sıradaki ay sonu kararının ayı; puanlar yalnız geçmiş ay sonu
  // kapanışlarını kullandığından karar gününden önce de hesaplanabilir. Verilmezse karar günü ayı (kural değişmez).
  const { tk, aySon } = D, m = ay != null ? ay : ayNo(tk[d]);
  let uyeT = tk[d], liste = D.uyeler(uyeT);
  if (!liste.length && ilkKarar) { uyeT = Date.UTC(new Date(tk[d]).getUTCFullYear(), new Date(tk[d]).getUTCMonth() + 1, 1); liste = D.uyeler(uyeT); }
  const Tm = i => tk[aySon.get(i)];
  const puan = [], eksikVeri = [];
  for (const s of liste) {
    const H = D.seri(s); if (!H) { eksikVeri.push({ s, neden: 'veri dosyası yok' }); continue; }
    const st = H.satir;
    if (!st.length) { eksikVeri.push({ s, neden: 'veri dosyası boş' }); continue; }
    if (!aySon.has(m - 13) || st[0].t > Tm(m - 13)) continue;   // < 13 ay geçmiş: kural gereği aday değil (eksik veri değil)
    const jS = sonOnce(st, tk[d]);
    if (jS < 0 || tk[d] - st[jS].t > 10 * GUN) { eksikVeri.push({ s, neden: jS < 0 ? 'karar gününe kadar çubuk yok' : `bayat: son çubuk ${tarih(st[jS].t)}` }); continue; }
    const j1 = sonOnce(st, Tm(m - 1)), j12 = sonOnce(st, Tm(m - 12));
    if (j1 < 0 || j12 < 0 || st[j1].t <= Tm(m - 2) || st[j12].t <= Tm(m - 13)) continue;
    puan.push({ s, p: st[j1].c / st[j12].c - 1 });
  }
  puan.sort((a, b) => b.p - a.p || (a.s < b.s ? -1 : 1));
  return { liste: puan.slice(0, K), aday: puan.length, uyeAy: new Date(uyeT).toISOString().slice(0, 7), uyeSay: liste.length, eksikVeri, tum: puan };
}

function simule(D, { karar, d0, dSon, seriler }) {
  const { tk, irxGun } = D;
  let nakit = 1, ucret = 0, faiz = 0, nakitFaiz = 0;
  const poz = new Map(), bekleyen = new Map(), egri = [], brut = [], adet = [], devir = new Map();
  const kap = (H, d) => (H.sonIdx[d] >= 0 ? H.satir[H.sonIdx[d]].c : NaN);
  const ctx = { poz, oz: 1 };
  for (let d = d0; d <= dSon; d++) {
    if (d > d0) {
      if (nakit > 0) { const f = nakit * irxGun[d - 1] / 100 / 252; nakit += f; nakitFaiz += f; }
      else if (nakit < 0) { const f = -nakit * (irxGun[d - 1] / 100 + MARJ_EK) / 252; nakit -= f; faiz += f; }
      for (const [s, u] of [...poz]) {
        const H = seriler(s);
        if (H.bar[d] || tk[d] <= H.sonT) continue;
        const f = H.satir[H.satir.length - 1].c, c = Math.abs(u) * f * KAYMA;
        nakit += u * f - c; ucret += c; poz.delete(s); bekleyen.delete(s);
      }
      if (bekleyen.size) {
        let oz = nakit;
        for (const [s, u] of poz) { const H = seriler(s); oz += u * (H.bar[d] ? H.bar[d].o : kap(H, d - 1)); }
        const ay = ayNo(tk[d]);
        for (const [s, w] of [...bekleyen]) {
          const H = seriler(s), b = H.bar[d];
          if (!b) { if (tk[d] > H.sonT) bekleyen.delete(s); continue; }
          bekleyen.delete(s);
          const mevcut = poz.get(s) || 0, istenen = w * oz / b.o, fark = istenen - mevcut;
          if (Math.abs(fark * b.o) < 1e-12) continue;
          const c = Math.abs(fark) * b.o * KAYMA;
          nakit -= fark * b.o + c; ucret += c;
          devir.set(ay, (devir.get(ay) || 0) + Math.abs(fark) * b.o / oz);
          if (Math.abs(istenen * b.o) < 1e-12) poz.delete(s); else poz.set(s, istenen);
        }
      }
    }
    let oz = nakit, br = 0;
    for (const [s, u] of poz) { const c = kap(seriler(s), d); oz += u * c; br += Math.abs(u * c); }
    egri.push({ time: tk[d], oz: Math.max(oz, 1e-12) }); brut.push(oz > 0 ? br / oz : 0); adet.push(poz.size);
    if (oz <= 0) break;
    ctx.oz = oz;
    if (d < dSon) { const k = karar(d, ctx); if (k) for (const [s, w] of Object.entries(k)) bekleyen.set(s, w); }
  }
  return { egri, brut, adet, devir, ucret, faiz, nakitFaiz };
}

function kararM10(D, d0, { kayit = null } = {}) {
  return (d, ctx) => {
    if (!ayGecis(D, d)) return null;
    const sec = secim(D, d, d === d0).liste.map(x => x.s);
    if (kayit) kayit.push({ t: D.tk[d], sec, kapali: false });
    const o = {};
    for (const s of ctx.poz.keys()) if (!sec.includes(s)) o[s] = 0;
    for (const s of sec) o[s] = 1 / K;
    return Object.keys(o).length ? o : null;
  };
}
function kararAlTut() { let ok = false; return () => (ok ? null : (ok = true, { QQQ: 1 / (1 + KAYMA) })); }

function kos(D, { dSon = D.tk.length - 1 } = {}) {
  const d0 = N.ilkIndeks(D.tk, BAS);
  const seriler = s => (s === 'QQQ' ? D.Q : D.seri(s));
  const at = simule(D, { karar: kararAlTut(), d0, dSon, seriler });
  const kayit = [];
  const m10 = simule(D, { karar: kararM10(D, d0, { kayit }), d0, dSon, seriler });
  m10.kayit = kayit;
  return { d0, at, m10 };
}
const olc = egri => ({ gel: N.metrik(egri, BAS, HOL), hol: N.metrik(egri, HOL), tum: N.metrik(egri, BAS) });

function hedef(D, kararGunu) {
  const t = T.ms(kararGunu), d = D.tk.indexOf(t);
  if (!T.aySonuMu(t, 'NYSE')) throw new Error(`m10: ${tarih(t)} NYSE ay sonu işlem günü değil`);
  if (d < 0) throw new Error(`m10: ${tarih(t)} için fiyat verisi yok (^GSPC son gün ${tarih(D.tk[D.tk.length - 1])})`);
  const s = secim(D, d, d === N.ilkIndeks(D.tk, BAS));
  const ud = UY.uyelerDurum(t);
  const tam = V.sonTamGun('^GSPC', 'NYSE');
  return { kararGunu: tarih(t), uygulamaGunu: tarih(T.sonrakiIslemGunu(t, 'NYSE')), liste: s.liste, agirlik: Object.fromEntries(s.liste.map(x => [x.s, 1 / K])),
    veriTam: !!tam && tam >= tarih(t),   // false → karar günü kapanışı henüz tam değil (yayından önce indirilmiş mum); karar DONDURULMAZ (F2)
    aday: s.aday, eksikVeri: s.eksikVeri, uyelik: { ay: s.uyeAy, uyeSay: s.uyeSay, kaynak: ud.kaynak, bayat: ud.bayat, uyari: ud.uyari } };
}

module.exports = { BAS, HOL, KAYMA, K, hazirla, ayGecis, secim, simule, kararM10, kararAlTut, kos, olc, hedef, sonOnce, ayNo };
