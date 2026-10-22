/**
 * PORTFÖY TASARIMCISI — MODEL PORTFÖY NAV MOTORU. PLAN-PORTFOY-TASARIMCI.md (b), sabitleme kayitlar/tasarim/t1-sN.json (en yüksek sürüm; s2 2026-10-11: m-837 bant ±10).
 * Öz test: node scripts/tasarimci-selftest.js (G–I) · mutabakat: node scripts/tasarimci-mutabakat.js 837 (karisim837 = bu dosya).
 *
 * SERİLER (her biri gun başına bir gunluk satırı; `endeks` HER ZAMAN USD, taban 100 = 2026-10-12 açılışı öncesi):
 *   m-qqq-m10   NYSE günleri. Ay son NYSE günü kapanışında karar (stratejiler/m10.js hedef), ertesi işlem günü AÇILIŞINDA
 *               dolum, kayma %0,05, her hisse 1/10; nakit ^IRX/100/252 (d−1), eksi nakit IRX + %1,5 (qqq-momentum.js simule
 *               BİREBİR). Verisi kesilen hisse son kapanıştan (kayma) nakde (aşağıda "kesilme").
 *   m-bist-m10  BIST günleri, TL'de tutulur (nakit/poz TL, endeksTl), endeks = USD (TL / USDTRY). Ay son BIST günü kararı,
 *               ertesi gün açılış dolumu; komisyon+BSMV %0,10 + kayma %0,05 tek yön; nakit TCMB politika faizi, borç +%5
 *               (bist-yenmek-momentum.js simule BİREBİR; açılış işlemlerinden SONRA faiz).
 *   m-837       takvim günü (UTC). Çekirdek QQQ (düzeltilmiş kapanış, ileri taşınır) + uydu Hücum SİMÜLASYON eğrisi
 *               (stratejiler/hucum.js simulasyonEgrisi('hucum') — perp entegre simülasyon; model kolu simülasyondur, demo bot
 *               değil). Sürüm 2 (t1-s2.json, deneme 851 D2): QQQ işlem günü kapanışında Hücum payı %40–%60 dışına
 *               çıkınca o kapanışta tam 50/50 (sürüm 1: takvim ayının son günü 50/50); aktarılan tutar × (%0,1 + %0,05). İlk gün QQQ açılışta
 *               kayma ile alınır (qqq-cekirdek-uydu.js karisim ile aynı model; karisim837 aşağıda, mutabakat bunu kullanır).
 *   k-qqq       QQQ al-tut (maliyetsiz), NYSE · k-btc BTC/USDT spot (market.db 1d; yedek Yahoo BTC-USD), takvim günü
 *   k-xu030     XU030 fiyat endeksi / USDTRY (+ endeksTl), BIST · k-ew-bist30 EW BIST30 (PIT evren 1/n ay sonu, BIST M10
 *               maliyetleri, faizsiz — bist-yenmek-momentum.js ewAltut ile aynı), USD + endeksTl
 *   Kıyasların tabanı da 2026-10-12 açılışıdır (aynı başlangıç).
 *
 * DONDURMA: her gün ÖNCEKİ GÜNÜN SATIRINDAKİ durumdan (nakit, poz = kapanış değeri, bekleyen emirler) ve o günün fiyat
 *   ORANLARINDAN (kapanış(d) / kapanış(d−1), açılış(d) / kapanış(d−1) — ikisi de güncel dosyadan) hesaplanır. Böylece
 *   sonradan gelen temettü/bölünme düzeltmesi (geçmişi ölçekler, oran değişmez) yazılmış satırları değiştirmez; gerçek veri
 *   revizyonu ise yalnız mutabakat uyarısı üretir (yenidenOynat). Sayılar 12 anlamlı basamağa yuvarlanıp saklanır ve sonraki
 *   gün yuvarlanmış durumdan sürer (deterministik).
 * İLERİYE BAKMAMA: karar yalnız karar gününe kadar kesilmiş veriyle (hazirla({ sonT: kararGunu })); gün satırı yalnız d ve
 *   d−1 fiyatlarıyla.
 * EKSİK VERİ: gün tamamlanmadıysa (endeks kapanışı yayından önce indirilmiş, tutulan hissenin o gün çubuğu henüz yok, Hücum
 *   eğrisi o güne gelmemiş…) satır YAZILMAZ, `bekle` (veriNotu) döner; sonraki tik tamamlar. Uygulama günü açılış verisi
 *   gelmiş ama gün kapanmamışsa dolumlar önden döner (zamanlayıcı dolumlar.jsonl'a yazar).
 * KESİLME (M10): tutulan hissenin d günü çubuğu yoksa — dosyada d'den sonraki çubuk var → o gün işlem yok (son kapanış);
 *   dosya d'nin yayınından SONRA indirilmiş ama d çubuğu yok → son kapanışla değerlenir, 5 NYSE günü üst üste böyleyse
 *   "verisi kesildi" → son kapanıştan kayma ile nakde (ölçüm betiği ilk gün satar; fark yalnız 4 günlük nakit faizi);
 *   dosya d'den önce indirilmiş → bekle (veri henüz gelmedi) — ANCAK dosya hiç yenilenmiyorsa (Yahoo 404, indirme eski kalır)
 *   ve endeks son çubuktan bu yana ≥ 5 tam işlem günü ilerlediyse aynı yol (son kapanış, 5. gün nakde) — model donmaz.
 *   BIST M10 ölçüm tanımında kesilme yok: son kapanışla tutulur.
 *
 * API
 *   sabitleme() → en yüksek sürümlü t1-sN.json · dengeleme837() · bantDisi(Q, H, wUydu, bant) · SERI · KIYAS_ESLE · BASLANGIC · ILK_KARAR · MODELLER (model id'leri) · SIRA (tüm seriler)
 *   piyasaKur({ simdi?, hucumEgri?, btc?, m10?, bist? }) → P  (simdi: takvim günü serilerinde yalnız KAPANMIŞ UTC günü — market.db'ye
 *        grafik önbelleğinden yarım günlük mum düşse de kullanılmaz) (tik başına önbellekli veri bağlamı; test enjeksiyonu)
 *   ilerlet(id, { P, satirlar, kararlar, bugun, kararUret, simdi, etiket }) → { satirlar, kararlar, dolumlar, veriNotu, uyarilar }
 *   yenidenOynat(id, { P, satirlar, kararlar, etiket }) → { fark: [{ gun, defter, yeniden }] }
 *   metrik(satirlar, alan = 'endeks') → { son, toplam, maxDD, gun, bas, bit }
 *   karisim837(zt, qc, he, { w, aktarim, kayma }) → { egri:[{ time, oz }], dengeleme }   (mutabakat yolu)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./takvim');
const V = require('./veri');
const DF = require('./defter');

const PROJE = path.join(__dirname, '..', '..');
const GUN = 864e5;
const KAYMA = 0.0005, MARJ_EK = 0.015, AKTARIM_837 = 0.001;
const BIST_KOM = 0.001, BIST_KAYMA = 0.0005, BIST_KREDI_EK = 0.05;
const KESILME_GUN = 5;
const R = x => (Number.isFinite(x) ? +x.toPrecision(12) : x);
const iso = T.iso;
const sonrakiGun = g => iso(T.ms(g) + GUN);
const M10 = () => require('./stratejiler/m10');
const BM = () => require('./stratejiler/bistM10');
const HU = () => require('./stratejiler/hucum');

let _sab = null, _sabDosya = null;
/** En yüksek sürümlü sabitleme dosyası (kayitlar/tasarim/t1-sN.json). Sürüm 2 (2026-10-11, Ö4): m-837 bant ±10 puan. */
function sabitlemeDosyasi() {
  const dz = path.join(PROJE, 'kayitlar', 'tasarim');
  const l = fs.readdirSync(dz).map(f => /^t1-s(\d+)\.json$/.exec(f)).filter(Boolean).sort((a, b) => +b[1] - +a[1]);
  if (!l.length) throw new Error('model: kayitlar/tasarim/t1-sN.json sabitleme dosyası yok');
  return l[0][0];
}
function sabitleme() {
  if (!_sab) { _sabDosya = sabitlemeDosyasi(); _sab = JSON.parse(fs.readFileSync(path.join(PROJE, 'kayitlar', 'tasarim', _sabDosya), 'utf8')); _sab._dosya = _sabDosya; }
  return _sab;
}
const sabYolu = () => 'kayitlar/tasarim/' + (sabitleme()._dosya);
/** m-837 dengeleme kuralı (sabitleme): { kural: 'bant', bantPuan, hedef } | { kural: 'ay-sonu-tam' }. */
const dengeleme837 = () => (modelSab('m-837') && modelSab('m-837').dengeleme) || { kural: 'ay-sonu-tam' };
/** Bant dışında mı: uydu (Hücum) payı hedef ± bant dışında (kavram-837.js BANT: h < 0,40 || h > 0,60 — sınır dahil değil). */
function bantDisi(Q, H, wUydu, bant) { const h = H / (Q + H); return h < wUydu - bant || h > wUydu + bant; }
const modelSab = id => sabitleme().modeller.find(m => m.id === id);
const BASLANGIC = '2026-10-12', ILK_KARAR = '2026-09-30';   // t1-sN.json baslangic (öz test eşitliği denetler)

const SERI = Object.freeze({
  'm-qqq-m10': { tur: 'model', takvim: 'NYSE', para: 'USD', karar: true },
  'm-bist-m10': { tur: 'model', takvim: 'BIST', para: 'TRY', karar: true },
  'm-837': { tur: 'model', takvim: 'GUN', para: 'USD', karar: false },
  'k-qqq': { tur: 'kiyas', ad: 'QQQ al-tut', takvim: 'NYSE', para: 'USD' },
  'k-btc': { tur: 'kiyas', ad: 'BTC al-tut', takvim: 'GUN', para: 'USD' },
  'k-xu030': { tur: 'kiyas', ad: 'XU030 (USD)', takvim: 'BIST', para: 'USD' },
  'k-ew-bist30': { tur: 'kiyas', ad: 'EW BIST30 (USD)', takvim: 'BIST', para: 'USD', karar: true },
});
const KIYAS_ESLE = Object.freeze({ QQQ: 'k-qqq', BTC: 'k-btc', XU030: 'k-xu030', 'EW-BIST30': 'k-ew-bist30' });
const MODELLER = ['m-837', 'm-qqq-m10', 'm-bist-m10'];
const SIRA = ['m-qqq-m10', 'k-qqq', 'm-bist-m10', 'k-ew-bist30', 'k-xu030', 'm-837', 'k-btc'];
const borsaAdi = tk => (tk === 'GUN' ? null : tk);

// ═══ PİYASA BAĞLAMI ═══════════════════════════════════════════════════════════
const ork = () => require('../veri/orkestrator');
const YAYIN = { NYSE: { tz: 'America/New_York', saat: 18 }, BIST: { tz: 'Europe/Istanbul', saat: 19 } };
function yayinAni(gun, borsa) { const d = new Date(T.ms(gun)); return ork().yereldenUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), YAYIN[borsa].saat, 0, YAYIN[borsa].tz); }
const kap = (H, i) => (i >= 0 && H.sonIdx[i] >= 0 ? H.satir[H.sonIdx[i]].c : NaN);

function btcOku() {
  const p = V.veriYolu('market.db');
  if (fs.existsSync(p)) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(p, { readOnly: true });
      try {
        const r = db.prepare(`SELECT time, open, close FROM candles WHERE venue='binance' AND market='spot' AND symbol='BTC/USDT' AND timeframe='1d' ORDER BY time`).all();
        if (r.length) return { kaynak: 'market.db spot BTC/USDT 1d', seri: r.map(x => ({ t: x.time, o: x.open, c: x.close })) };
      } finally { db.close(); }
    } catch (e) { /* yedek */ }
  }
  for (const yedek of [V.dosyaBul('BTC-USD') && V.dosyaBul('BTC-USD').dosya, path.join(V.dizinler().bist, 'BTC_USD.json')].filter(Boolean)) {
    if (!fs.existsSync(yedek)) continue;
    const j = JSON.parse(fs.readFileSync(yedek, 'utf8'));
    return { kaynak: 'Yahoo BTC-USD (' + path.relative(path.dirname(V.veriYolu('portfoy')), yedek) + ')', seri: j.gunler.filter(x => x.c > 0 && x.o > 0).map(x => ({ t: x.t, o: x.o, c: x.c })) };
  }
  return { kaynak: null, seri: [] };
}

/** Tik başına veri bağlamı. Hepsi tembel ve önbellekli; test sahte veri kökü (veri.js ortam) + enjeksiyonla kurar. */
function piyasaKur(enj = {}) {
  const onb = {};
  const tek = (k, f) => (k in onb ? onb[k] : (onb[k] = f()));
  const P = { simdi: enj.simdi != null ? enj.simdi : Date.now() };
  P.nyse = () => tek('nyse', () => {
    const D = enj.m10 ? enj.m10() : M10().hazirla();
    const idx = new Map(D.tk.map((t, i) => [t, i]));
    const sonTam = new Map(), ind = new Map();
    const N = {
      D, idx, tamSon: V.sonTamGun('^GSPC', 'NYSE'),
      seri: s => (s === 'QQQ' ? D.Q : D.seri(s)),
      sonTam: s => { if (!sonTam.has(s)) sonTam.set(s, V.sonTamGun(s, 'NYSE')); return sonTam.get(s); },
      indirme: s => { if (!ind.has(s)) { let v = NaN; try { v = Date.parse(V.ham(s).indirme || ''); } catch (e) { v = NaN; } ind.set(s, v); } return ind.get(s); },
    };
    return N;
  });
  P.bist = () => tek('bist', () => {
    const X = enj.bist ? enj.bist() : BM().hazirla();
    const idx = new Map(X.takvim.map((t, i) => [t, i]));
    const u = V.usdtry(), sonTam = new Map(), ind = new Map();
    let xuHam = new Map();
    try { xuHam = new Map(V.ham('XU030.IS').gunler.filter(g => g.c > 0).map(g => [g.t, g])); } catch (e) { /* yok */ }
    return {
      X, idx, tamSon: V.sonTamGun('XU030.IS', 'BIST'), usdSon: u.length ? iso(u[u.length - 1].t) : null, xuHam,
      sonTam: s => { if (!sonTam.has(s)) sonTam.set(s, V.sonTamGun(s + '.IS', 'BIST')); return sonTam.get(s); },
      indirme: s => { if (!ind.has(s)) { let v = NaN; try { v = Date.parse(V.ham(s + '.IS').indirme || ''); } catch (e) { v = NaN; } ind.set(s, v); } return ind.get(s); },
    };
  });
  P.hucum = () => tek('hucum', () => {
    let e, hata = null;
    try { e = enj.hucumEgri ? enj.hucumEgri() : HU().simulasyonEgrisi('hucum'); } catch (x) { e = []; hata = x.message; }
    return { m: new Map(e.map(p => [p.time, p.oz])), son: e.length ? iso(e[e.length - 1].time) : null, hata };
  });
  P.btc = () => tek('btc', () => {
    const b = enj.btc ? { kaynak: 'enjekte', seri: enj.btc() } : btcOku();
    return { kaynak: b.kaynak, m: new Map(b.seri.map(x => [x.t, x])), son: b.seri.length ? iso(b.seri[b.seri.length - 1].t) : null };
  });
  P.nyseKarar = K => tek('nk' + K, () => (enj.m10 ? enj.m10({ sonT: T.ms(K) }) : M10().hazirla({ sonT: T.ms(K) })));
  P.bistKarar = K => tek('bk' + K, () => (enj.bist ? enj.bist({ sonT: T.ms(K) }) : BM().hazirla({ sonT: T.ms(K) })));
  return P;
}

// ═══ KARARLAR ════════════════════════════════════════════════════════════════
const yuvarlaListe = l => l.map(x => ({ s: x.s, p: R(x.p) }));
const kararAnahtar = k => `${k.model}|${k.kararGunu}`;
function kararImzala(k) { const { girdiImza, olusturma, ...g } = k; return { ...k, girdiImza: DF.sha({ ...g, makine: undefined, deneme: undefined }) }; }

/** Karar hesapla (yalnız karar gününe kadar kesilmiş veriyle). → { kayit } | { bekle } */
function kararHesapla(id, K, P, { ilk = false } = {}) {
  try {
    if (id === 'm-qqq-m10') {
      let h = null, hata = null;
      try { h = M10().hedef(P.nyseKarar(K), K); } catch (e) { hata = e.message; }
      if (ilk) {
        const sab = modelSab(id).baslangic, l = sab.ilkListe;
        const dog = h ? (JSON.stringify(h.liste.map(x => x.s)) === JSON.stringify(l) ? 'birebir' : `FARKLI: hesaplanan ${h.liste.map(x => x.s).join(' ')}`) : `hesaplanamadı (${hata})`;
        return { kayit: { model: id, kararGunu: K, uygulamaGunu: sab.ilkUygulamaGunu, ilk: true, kaynak: sabYolu() + ' ilkListe (sabitleme)',
          liste: h && dog === 'birebir' ? yuvarlaListe(h.liste) : l.map(s => ({ s, p: null })), agirlik: Object.fromEntries(l.map(s => [s, 1 / l.length])),
          aday: h ? h.aday : null, eksikVeri: h ? h.eksikVeri : [], uyelik: h ? h.uyelik : null, dogrulama: dog } };
      }
      if (!h) return { bekle: `${K} Nova kararı hesaplanamadı: ${hata}` };
      if (!h.veriTam) return { bekle: `${K} Nova kararı bekliyor: ^GSPC ${K} kapanışı henüz tam değil` };
      // B12 (DENETIM-CANLI-PORTFOY): verisi eksik/bayat aday varsa karar BIST'teki gibi bekletilir (geç gelen çubuk sıralamayı
      // değiştirebilir); ^GSPC bir sonraki günü de tam kapattıysa (kaynak artık vermiyor) karar eksikVeri uyarısıyla verilir.
      if (h.eksikVeri && h.eksikVeri.length && !((P.nyse().tamSon || '') > K)) return { bekle: `${K} Nova kararı bekliyor: ${h.eksikVeri.length} hissenin verisi eksik (${h.eksikVeri.slice(0, 5).map(x => x.s || x).join(', ')}) — ertesi işlem günü kesinleşir` };
      return { kayit: { model: id, kararGunu: K, uygulamaGunu: h.uygulamaGunu, liste: yuvarlaListe(h.liste), agirlik: h.agirlik, aday: h.aday, eksikVeri: h.eksikVeri, uyelik: h.uyelik } };
    }
    if (id === 'm-bist-m10') {
      let h = null, hata = null;
      try { h = BM().hedef(P.bistKarar(K), K); } catch (e) { hata = e.message; }
      if (ilk) {
        const sab = modelSab(id).baslangic, l = sab.ilkListe;
        const dog = h ? (JSON.stringify(h.liste.map(x => x.s)) === JSON.stringify(l) ? 'birebir' : `FARKLI: hesaplanan ${h.liste.map(x => x.s).join(' ')}`) : `hesaplanamadı (${hata})`;
        return { kayit: { model: id, kararGunu: K, uygulamaGunu: sab.ilkUygulamaGunu, ilk: true, kaynak: sabYolu() + ' ilkListe (sabitleme)',
          liste: h && dog === 'birebir' ? yuvarlaListe(h.liste) : l.map(s => ({ s, p: null })), agirlik: Object.fromEntries(l.map(s => [s, 1 / l.length])),
          aday: h ? h.aday : null, evren: h ? h.evren : null, eksikVeri: [], dogrulama: dog } };
      }
      if (!h) return { bekle: `${K} Lydia kararı hesaplanamadı: ${hata}` };
      if (!h.veriTam) return { bekle: `${K} Lydia kararı bekliyor: XU030 ${K} kapanışı henüz tam değil` };
      // Seçim (F2 denetimi): karar günü çubuğu tam olmayan hisse varsa karar BEKLETİLİR (evren cirosu yarım günle olmasın);
      // XU030 bir sonraki günü de tam kapattıysa (dosya artık yenilenmiyor) karar verilir, hisseler eksikVeri uyarısıyla kayda düşer.
      if (h.eksikVeri.length && !(h.xuTam > K)) return { bekle: `${K} Lydia kararı bekliyor: ${h.eksikVeri.length} hissenin ${K} çubuğu tam değil (${h.eksikVeri.slice(0, 5).map(x => x.s).join(', ')})` };
      return { kayit: { model: id, kararGunu: K, uygulamaGunu: h.uygulamaGunu, liste: yuvarlaListe(h.liste), agirlik: h.agirlik, aday: h.aday, evren: h.evren, eksikVeri: h.eksikVeri } };
    }
    if (id === 'k-ew-bist30') {
      const X = P.bistKarar(K), d = X.takvim.indexOf(T.ms(K));
      if (!T.aySonuMu(K, 'BIST')) return { bekle: `${K} BIST ay sonu değil` };
      if (d < 0) return { bekle: `${K} EW BIST30 evreni: o güne BIST verisi yok` };
      const tam = V.sonTamGun('XU030.IS', 'BIST');
      if (!ilk && !(tam && tam >= K)) return { bekle: `${K} EW BIST30 evreni bekliyor: XU030 ${K} kapanışı henüz tam değil` };
      if (!ilk) {
        const yarim = [...X.H].filter(([s2, h]) => h.bar[d] && !((V.sonTamGun(s2 + '.IS', 'BIST') || '') >= K)).map(([s2]) => s2);
        if (yarim.length && !(tam > K)) return { bekle: `${K} EW BIST30 evreni bekliyor: ${yarim.length} hissenin ${K} çubuğu tam değil` };
      }
      const ev = BM().evrenLikidite(X, d);
      if (!ev.length) return { bekle: `${K} EW BIST30 evreni boş` };
      return { kayit: { model: id, kararGunu: K, uygulamaGunu: ilk ? BASLANGIC : iso(T.sonrakiIslemGunu(K, 'BIST')), ilk: ilk || undefined, liste: ev.map(s => ({ s, p: null })),
        agirlik: Object.fromEntries(ev.map(s => [s, 1 / ev.length])), evren: ev.length } };
    }
    if (id === 'm-837') {
      const kol = modelSab(id).kollar;
      return { kayit: { model: id, kararGunu: K, uygulamaGunu: BASLANGIC, ilk: true, tur2: 'yerlesim', kaynak: sabYolu() + ' kollar',
        agirlik: Object.fromEntries(kol.map(k => [k.kol, k.agirlik])), kollar: kol.map(k => ({ kol: k.kol, strateji: k.strateji, agirlik: k.agirlik })) } };
    }
  } catch (e) { return { bekle: `${id} ${K} kararı: ${e.message}` }; }
  return { bekle: `${id}: karar tanımı yok` };
}

// ═══ GÜN ADIMLARI ════════════════════════════════════════════════════════════
/** Tutulan/hedef hissenin i günü çubuğu yoksa: 'islemYok' (sonra çubuk var) | 'gecici' | 'kesildi' | 'bekle'. */
/**
 * Kanıt iki yoldan: (1) hissenin dosyası d'nin yayınından SONRA indirildi ama d çubuğu yok; (2) dosya hiç yenilenmiyor
 * (Yahoo artık veri vermiyor / 404 → orkestratör dosyayı yeniden yazmaz, indirme eski kalır) ama endeks (^GSPC / XU030) son
 * çubuktan bu yana ≥ KESILME_GUN tam işlem günü ilerledi — kaynağın bu kadar gecikmesi olağan değil → hisse ölü sayılır.
 * İkisi de yoksa 'bekle' (veri henüz gelmedi; en çok KESILME_GUN gün sürer, sonra (2) devreye girer).
 */
function kesilme(B, s, H, i, gun, borsa, tk) {
  if (H.sonT > T.ms(gun) || (H.satir.length && H.satir[H.satir.length - 1].t > T.ms(gun))) return 'islemYok';
  const son = H.satir.length ? H.satir[H.satir.length - 1].t : -Infinity;
  const ufuk = B.tamSon ? T.ms(B.tamSon) : -Infinity;
  let nUfuk = 0; for (let j = tk.length - 1; j >= 0 && tk[j] > son; j--) if (tk[j] <= ufuk) nUfuk++;
  const ind = B.indirme(s);
  if (!(ind >= yayinAni(gun, borsa)) && nUfuk < KESILME_GUN) return 'bekle';
  let n = 0; for (let j = i; j >= 0 && tk[j] > son; j--) n++;
  return n >= KESILME_GUN ? 'kesildi' : 'gecici';
}
/** Çubuk dosyanın son çubuğuysa o günün tamamlandığı kanıtlanmalı (indirme yayından sonra). */
function barTam(B, s, H, i, gun) {
  const st = H.satir, j = H.sonIdx[i];
  if (j < st.length - 1) return true;
  const t = B.sonTam(s); return !!t && t >= gun;
}
const ozet = m => Object.fromEntries([...m].map(([k, v]) => [k, R(v)]));

function adimM10(P, prev, gun, ctx) {
  const N = P.nyse(), D = N.D, t = T.ms(gun), i = N.idx.get(t);
  if (i == null) return N.tamSon && N.tamSon > gun ? { atla: `${gun} takvim.js'te NYSE işlem günü ama ^GSPC verisinde yok — atlandı` } : { bekle: `^GSPC ${gun} verisi henüz yok (son tam gün ${N.tamSon || '—'})` };
  let nakit, bekleyen; const u = new Map(), dolum = [], not = [];
  if (!prev) { nakit = 100; bekleyen = new Map(Object.entries(ctx.ilkKarar.agirlik)); }
  else {
    if (N.idx.get(T.ms(prev.gun)) !== i - 1) return { bekle: `sıra bozuk: önceki satır ${prev.gun}, ${gun}'den önceki ^GSPC günü ${iso(D.tk[i - 1])}` };
    nakit = prev.nakit; bekleyen = new Map(Object.entries(prev.bekleyen || {}));
    for (const [s, deger] of Object.entries(prev.poz)) {
      const H = N.seri(s); if (!H) return { bekle: `${s} verisi yok (tutulan hisse)` };
      u.set(s, deger / kap(H, i - 1));
    }
    const r = D.irxGun[i - 1];
    if (nakit > 0) nakit += nakit * r / 100 / 252;
    else if (nakit < 0) nakit -= -nakit * (r / 100 + MARJ_EK) / 252;
    for (const [s, uu] of [...u]) {
      const H = N.seri(s);
      if (H.bar[i]) continue;
      const k = kesilme(N, s, H, i, gun, 'NYSE', D.tk);
      if (k === 'bekle') return { bekle: `${s}: ${gun} çubuğu henüz yok` };
      if (k === 'kesildi') {
        const f = kap(H, i), c = Math.abs(uu) * f * KAYMA;
        nakit += uu * f - c;
        dolum.push({ s, yon: 'nakde', oncekiDeger: R(uu * f), yeniDeger: 0, fiyat: R(H.satir[H.satir.length - 1].ham), maliyet: R(c), neden: `verisi kesildi (son çubuk ${iso(H.satir[H.satir.length - 1].t)}, ${KESILME_GUN} NYSE günü çubuksuz)` });
        u.delete(s); bekleyen.delete(s); not.push(`${s} verisi kesildi → nakde`);
      } else not.push(`${s} ${gun} çubuğu yok — son kapanışla değerlendi${k === 'gecici' ? ' (verisi kesilmiş olabilir)' : ''}`);
    }
  }
  if (bekleyen.size) {
    let oz = nakit;
    for (const [s, uu] of u) { const H = N.seri(s); oz += uu * (H.bar[i] ? H.bar[i].o : kap(H, i - 1)); }
    for (const [s, w] of [...bekleyen]) {
      const H = N.seri(s); if (!H) return { bekle: `${s} (hedef) verisi yok — indirilmeli` };
      const b = H.bar[i];
      if (!b) {
        const k = kesilme(N, s, H, i, gun, 'NYSE', D.tk);
        if (k === 'bekle') return { bekle: `${s} (hedef): ${gun} açılış çubuğu henüz yok` };
        if (k === 'kesildi') { bekleyen.delete(s); not.push(`${s} hedefti, verisi kesildi — alınmadı`); } else not.push(`${s} hedef emri ${gun}'de çubuk olmadığı için bekliyor`);
        continue;
      }
      bekleyen.delete(s);
      const mevcut = u.get(s) || 0, istenen = w * oz / b.o, fark = istenen - mevcut;
      if (Math.abs(fark * b.o) < 1e-12) continue;
      const c = Math.abs(fark) * b.o * KAYMA;
      nakit -= fark * b.o + c;
      dolum.push({ s, yon: fark > 0 ? 'al' : 'sat', agirlik: w, oncekiDeger: R(mevcut * b.o), yeniDeger: R(istenen * b.o), fiyat: R(b.o / b.k), duzeltilmisFiyat: R(b.o), maliyet: R(c) });
      if (Math.abs(istenen * b.o) < 1e-12) u.delete(s); else u.set(s, istenen);
    }
  }
  if (!N.tamSon || N.tamSon < gun) return { bekle: `^GSPC ${gun} kapanışı henüz tam değil (son tam gün ${N.tamSon || '—'})`, dolum };
  let oz = nakit; const poz = new Map();
  for (const [s, uu] of u) {
    const H = N.seri(s);
    if (H.bar[i] && !barTam(N, s, H, i, gun)) return { bekle: `${s} ${gun} kapanışı henüz tam değil`, dolum };
    const c = kap(H, i); oz += uu * c; poz.set(s, uu * c);
  }
  const k = ctx.kararBul(gun);
  if (k) { for (const s of u.keys()) if (!(s in k.agirlik)) bekleyen.set(s, 0); for (const [s, w] of Object.entries(k.agirlik)) bekleyen.set(s, w); }
  return { satir: { endeks: R(oz), nakit: R(nakit), poz: ozet(poz), bekleyen: bekleyen.size ? Object.fromEntries(bekleyen) : undefined, ...(k ? { karar: k.kararGunu } : {}) }, dolum, not };
}

function adimBist(P, prev, gun, ctx, { faizli = true } = {}) {
  const B = P.bist(), X = B.X, t = T.ms(gun), i = B.idx.get(t);
  if (i == null) return B.tamSon && B.tamSon > gun ? { atla: `${gun} takvim.js'te BIST işlem günü ama BIST verisinde yok — atlandı` } : { bekle: `BIST ${gun} verisi henüz yok (XU030 son tam gün ${B.tamSon || '—'})` };
  let nakit, bekleyen; const u = new Map(), dolum = [], not = [];
  if (!prev) { nakit = 100; bekleyen = new Map(Object.entries(ctx.ilkKarar.agirlik)); }
  else {
    if (B.idx.get(T.ms(prev.gun)) !== i - 1) return { bekle: `sıra bozuk: önceki satır ${prev.gun}, ${gun}'den önceki BIST veri günü ${iso(X.takvim[i - 1])}` };
    nakit = prev.nakit; bekleyen = new Map(Object.entries(prev.bekleyen || {}));
    for (const [s, deger] of Object.entries(prev.poz)) { const h = X.H.get(s); if (!h) return { bekle: `${s}.IS verisi yok (tutulan hisse)` }; u.set(s, deger / kap(h, i - 1)); }
    for (const s of u.keys()) {
      const h = X.H.get(s); if (h.bar[i]) continue;
      const k = kesilme(B, s, h, i, gun, 'BIST', X.takvim);
      if (k === 'bekle') return { bekle: `${s}.IS: ${gun} çubuğu henüz yok` };
      not.push(`${s} ${gun} çubuğu yok — son kapanışla tutuldu`);
    }
  }
  let oz = nakit;
  for (const [s, uu] of u) { const h = X.H.get(s); oz += uu * (h.bar[i] ? h.bar[i].o : kap(h, i - 1)); }
  for (const [s, w] of [...bekleyen]) {
    const h = X.H.get(s); if (!h) return { bekle: `${s}.IS (hedef) verisi yok — indirilmeli` };
    const b = h.bar[i];
    if (!b) { const k = kesilme(B, s, h, i, gun, 'BIST', X.takvim); if (k === 'bekle') return { bekle: `${s}.IS (hedef): ${gun} açılış çubuğu henüz yok` }; not.push(`${s} hedef emri bekliyor (çubuk yok)`); continue; }
    bekleyen.delete(s);
    const mevcut = u.get(s) || 0, istenen = w * oz / b.o, fark = istenen - mevcut;
    if (Math.abs(fark * b.o) < 1e-9) continue;
    const fiyat = b.o * (1 + Math.sign(fark) * BIST_KAYMA);
    const c = Math.abs(fark) * fiyat * BIST_KOM + Math.abs(fark) * b.o * BIST_KAYMA;
    nakit -= fark * fiyat + Math.abs(fark) * fiyat * BIST_KOM;
    dolum.push({ s, yon: fark > 0 ? 'al' : 'sat', agirlik: w, oncekiDeger: R(mevcut * b.o), yeniDeger: R(istenen * b.o), fiyat: R(b.o * b.ham / b.c), duzeltilmisFiyat: R(b.o), maliyet: R(c), para: 'TRY' });
    if (istenen * b.o < 1e-9) u.delete(s); else u.set(s, istenen);
  }
  if (prev && faizli) {
    const gunSay = (X.takvim[i] - X.takvim[i - 1]) / GUN, r = X.faiz(X.takvim[i - 1]);
    if (nakit > 0) nakit += nakit * r * gunSay / 365;
    else if (nakit < 0) nakit -= -nakit * (r + BIST_KREDI_EK) * gunSay / 365;
  }
  if (!B.tamSon || B.tamSon < gun) return { bekle: `XU030 ${gun} kapanışı henüz tam değil (son tam gün ${B.tamSon || '—'})`, dolum };
  if (!B.usdSon || B.usdSon < gun) return { bekle: `USDTRY ${gun} verisi henüz yok (son ${B.usdSon || '—'})`, dolum };
  let tl = nakit; const poz = new Map();
  for (const [s, uu] of u) {
    const h = X.H.get(s);
    if (h.bar[i] && !barTam(B, s, h, i, gun)) return { bekle: `${s}.IS ${gun} kapanışı henüz tam değil`, dolum };
    const c = kap(h, i); tl += uu * c; poz.set(s, uu * c);
  }
  const usd = X.USD[i];
  const endeks = prev ? prev.endeks * (tl / usd) / (prev.endeksTl / X.USD[i - 1]) : 100 * (tl / usd) / (100 / X.USD[i - 1]);
  const k = ctx.kararBul(gun);
  if (k) { for (const s of u.keys()) if (!(s in k.agirlik)) bekleyen.set(s, 0); for (const [s, w] of Object.entries(k.agirlik)) bekleyen.set(s, w); }
  return { satir: { endeks: R(endeks), endeksTl: R(tl), usdtry: R(usd), nakit: R(nakit), poz: ozet(poz), bekleyen: bekleyen.size ? Object.fromEntries(bekleyen) : undefined, ...(k ? { karar: k.kararGunu } : {}) }, dolum, not };
}

function adimQqq(P, prev, gun) {
  const N = P.nyse(), Q = N.D.Q, i = N.idx.get(T.ms(gun));
  if (i == null) return N.tamSon && N.tamSon > gun ? { atla: `${gun} ^GSPC verisinde yok — atlandı` } : { bekle: `^GSPC ${gun} verisi henüz yok` };
  if (!N.tamSon || N.tamSon < gun) return { bekle: `^GSPC ${gun} kapanışı henüz tam değil` };
  if (Q.bar[i] && !barTam(N, 'QQQ', Q, i, gun)) return { bekle: `QQQ ${gun} kapanışı henüz tam değil` };
  if (!prev) { const b = Q.bar[i]; if (!b) return { bekle: `QQQ ${gun} açılışı yok` }; return { satir: { endeks: R(100 * kap(Q, i) / b.o), fiyat: R(Q.satir[Q.sonIdx[i]].ham) } }; }
  if (N.idx.get(T.ms(prev.gun)) !== i - 1) return { bekle: `sıra bozuk (${prev.gun} → ${gun})` };
  return { satir: { endeks: R(prev.endeks * kap(Q, i) / kap(Q, i - 1)), fiyat: R(Q.satir[Q.sonIdx[i]].ham) } };
}

function adimXu(P, prev, gun) {
  const B = P.bist(), X = B.X, i = B.idx.get(T.ms(gun));
  if (i == null) return B.tamSon && B.tamSon > gun ? { atla: `${gun} BIST verisinde yok — atlandı` } : { bekle: `BIST ${gun} verisi henüz yok` };
  if (!B.tamSon || B.tamSon < gun) return { bekle: `XU030 ${gun} kapanışı henüz tam değil` };
  if (!B.usdSon || B.usdSon < gun) return { bekle: `USDTRY ${gun} verisi henüz yok` };
  const c = X.XU030[i], usd = X.USD[i];
  if (!prev) {
    const h = B.xuHam.get(T.ms(gun)); if (!h || !(h.o > 0)) return { bekle: `XU030 ${gun} açılışı yok` };
    return { satir: { endeks: R(100 * (c / usd) / (h.o / X.USD[i - 1])), endeksTl: R(100 * c / h.o), fiyat: R(c), usdtry: R(usd) } };
  }
  if (B.idx.get(T.ms(prev.gun)) !== i - 1) return { bekle: `sıra bozuk (${prev.gun} → ${gun})` };
  return { satir: { endeks: R(prev.endeks * (c / usd) / (X.XU030[i - 1] / X.USD[i - 1])), endeksTl: R(prev.endeksTl * c / X.XU030[i - 1]), fiyat: R(c), usdtry: R(usd) } };
}

/** QQQ düzeltilmiş kapanışı (takvim günü d'ye kadarki son çubuk) + o çubuğun günü. */
function qqqGun(N, t) { const st = N.D.Q.satir; let lo = 0, hi = st.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (st[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r < 0 ? null : st[r]; }
function qqqTamMi(N, gun) {
  const t = T.ms(gun), son = T.islemGunuMu(t, 'NYSE') ? t : T.oncekiIslemGunu(t, 'NYSE');
  const tam = N.sonTam('QQQ');
  return !!tam && tam >= iso(son) ? null : `QQQ ${iso(son)} kapanışı henüz tam değil (son tam gün ${tam || '—'})`;
}

function adim837(P, prev, gun, ctx) {
  const N = P.nyse(), Hc = P.hucum(), t = T.ms(gun);
  const eksik = qqqTamMi(N, gun);
  if (eksik) return { bekle: eksik };
  if (t + GUN > P.simdi) return { bekle: `${gun} UTC günü henüz kapanmadı (Kairos günlük mumu)` };
  if (!Hc.m.has(t) || !Hc.m.has(t - GUN)) return { bekle: `Kairos simülasyon eğrisi ${gun}'e gelmedi (son ${Hc.son || '—'}${Hc.hata ? '; ' + Hc.hata : ''})` };
  const hr = Hc.m.get(t) / Hc.m.get(t - GUN);
  let Q, H; const dolum = [];
  const w = ctx.ilkKarar.agirlik;
  if (!prev) {
    const i = N.idx.get(t), b = i != null ? N.D.Q.bar[i] : null;
    if (!b) return { bekle: `QQQ ${gun} açılışı yok` };
    Q = 100 * w.cekirdek * (1 - KAYMA) * kap(N.D.Q, i) / b.o; H = 100 * w.uydu * hr;
    dolum.push({ s: 'QQQ', kol: 'cekirdek', yon: 'al', agirlik: w.cekirdek, oncekiDeger: 0, yeniDeger: R(100 * w.cekirdek), fiyat: R(b.o / b.k), duzeltilmisFiyat: R(b.o), maliyet: R(100 * w.cekirdek * KAYMA) });
    dolum.push({ s: 'HUCUM-SIM', kol: 'uydu', yon: 'al', agirlik: w.uydu, oncekiDeger: 0, yeniDeger: R(100 * w.uydu), fiyat: null, maliyet: 0, not: 'Kairos simülasyon eğrisi (model kolu; demo bot değil)' });
  } else {
    if (prev.gun !== iso(t - GUN)) return { bekle: `sıra bozuk (${prev.gun} → ${gun})` };
    const a = qqqGun(N, t), b = qqqGun(N, t - GUN);
    if (!a || !b) return { bekle: 'QQQ verisi yok' };
    Q = prev.kollar.cekirdek * a.c / b.c; H = prev.kollar.uydu * hr;
  }
  let karar = null, once = null;
  const DK = dengeleme837(), bantli = DK.kural === 'bant';
  // Sürüm 2 (t1-s2.json): QQQ işlem günü kapanışında Hücum payı %40–%60 dışındaysa tam 50/50 (kavram-837.js D2 BİREBİR);
  // sürüm 1: takvim ayının son günü kapanışında 50/50.
  const qBugun = bantli ? qqqGun(N, t) : null;
  const dengele = bantli ? !!(prev && qBugun && qBugun.t === t && bantDisi(Q, H, w.uydu, DK.bantPuan)) : new Date(t + GUN).getUTCMonth() !== new Date(t).getUTCMonth();
  if (dengele) {
    once = { cekirdek: R(Q), uydu: R(H) };
    const Vt = Q + H, A = Math.abs(Q - w.cekirdek * Vt), c = A * (AKTARIM_837 + KAYMA);
    dolum.push({ s: 'aktarim', yon: Q > w.cekirdek * Vt ? 'cekirdek→uydu' : 'uydu→cekirdek', oncekiDeger: R(Q), yeniDeger: R(w.cekirdek * (Vt - c)), tutar: R(A), maliyet: R(c) });
    karar = { model: 'm-837', kararGunu: gun, uygulamaGunu: gun, tur2: 'dengeleme', kural: bantli ? 'bant' : 'ay-sonu-tam', ...(bantli ? { bantPuan: DK.bantPuan } : {}), agirlik: w, dengeleme: { oncekiAgirlik: { cekirdek: R(Q / Vt), uydu: R(H / Vt) }, aktarim: R(A), maliyet: R(c) } };
    Q = w.cekirdek * (Vt - c); H = w.uydu * (Vt - c);
  }
  return { satir: { endeks: R(Q + H), kollar: { cekirdek: R(Q), uydu: R(H) }, ...(once ? { kollarOnce: once, dengelendi: true } : {}) }, dolum, karar };
}

function adimBtc(P, prev, gun) {
  const B = P.btc(), t = T.ms(gun), x = B.m.get(t);
  if (t + GUN > P.simdi) return { bekle: `BTC ${gun} UTC günü henüz kapanmadı` };
  if (!x) return { bekle: `BTC ${gun} günlük mumu yok (son ${B.son || '—'}; ${B.kaynak || 'kaynak yok'})` };
  if (!prev) return { satir: { endeks: R(100 * x.c / x.o), fiyat: R(x.c) } };
  const y = B.m.get(t - GUN);
  if (!y || prev.gun !== iso(t - GUN)) return { bekle: `BTC ${iso(t - GUN)} mumu yok / sıra bozuk` };
  return { satir: { endeks: R(prev.endeks * x.c / y.c), fiyat: R(x.c) } };
}

function adim(id, P, prev, gun, ctx) {
  switch (id) {
    case 'm-qqq-m10': return adimM10(P, prev, gun, ctx);
    case 'm-bist-m10': return adimBist(P, prev, gun, ctx);
    case 'k-ew-bist30': return adimBist(P, prev, gun, ctx, { faizli: false });
    case 'm-837': return adim837(P, prev, gun, ctx);
    case 'k-qqq': return adimQqq(P, prev, gun);
    case 'k-xu030': return adimXu(P, prev, gun);
    case 'k-btc': return adimBtc(P, prev, gun);
    default: throw new Error(`model: bilinmeyen seri ${id}`);
  }
}

// ═══ SÜRÜCÜ ══════════════════════════════════════════════════════════════════
function gunler(takvim, bas, son) {
  if (bas > son) return [];
  if (takvim === 'GUN') { const o = []; for (let t = T.ms(bas); t <= T.ms(son); t += GUN) o.push(iso(t)); return o; }
  return T.islemGunleri(bas, son, takvim).map(iso);
}
const ilkKararId = id => (SERI[id].karar || id === 'm-837' ? id : null);
const aySonuMu = (id, gun) => SERI[id].karar && T.aySonuMu(gun, SERI[id].takvim);
function etiketle(x, etiket) { return { ...x, makine: etiket.makine, ...(etiket.deneme ? { deneme: true } : {}) }; }

/**
 * Bir seriyi son yazılı günden bugüne ilerlet. Hiçbir şey YAZMAZ — eklenecek satırları döndürür (zamanlayıcı yazar).
 * satirlar: o serinin gunluk satırları (sıralı) · kararlar: TÜM karar satırları (dondurulmuş) · bugun: 'YYYY-MM-DD' (UTC)
 * kararUret false → eksik karar üretilmez (yenidenOynat; yalnız defterdeki kararlar).
 */
function ilerlet(id, { P, satirlar = [], kararlar = [], bugun, kararUret = true, simdi = Date.now(), etiket = { makine: DF.makine() }, sonGun = null } = {}) {
  const tanim = SERI[id]; if (!tanim) throw new Error(`model: bilinmeyen seri ${id}`);
  const out = { satirlar: [], kararlar: [], dolumlar: [], veriNotu: null, uyarilar: [], notlar: [] };
  const kId = id === 'k-xu030' || id === 'k-qqq' || id === 'k-btc' ? null : id;
  const kmap = new Map(kararlar.filter(k => k.model === kId).map(k => [k.kararGunu, k]));
  const kararEkle = (k) => { const kk = etiketle(kararImzala({ tur: 'karar', surum: 1, ...k, olusturma: new Date(simdi).toISOString() }), etiket); kmap.set(kk.kararGunu, kk); out.kararlar.push(kk); return kk; };
  let ilkKarar = null;
  if (kId) {
    ilkKarar = kmap.get(ILK_KARAR) || null;
    if (!ilkKarar) {
      if (!kararUret) { out.veriNotu = `${id}: ilk karar (${ILK_KARAR}) defterde yok`; return out; }
      const r = kararHesapla(kId, ILK_KARAR, P, { ilk: true });
      if (r.bekle) { out.veriNotu = r.bekle; return out; }
      ilkKarar = kararEkle(r.kayit);
      if (r.kayit.dogrulama && r.kayit.dogrulama !== 'birebir') out.uyarilar.push(`${id} ilk karar doğrulaması: ${r.kayit.dogrulama} — sabitleme listesi kullanıldı`);
    }
    if (ilkKarar.eksikVeri && ilkKarar.eksikVeri.length) out.uyarilar.push(`${id} ${ILK_KARAR} kararında verisi eksik üyeler: ${ilkKarar.eksikVeri.map(x => `${x.s} (${x.neden})`).join(', ')}`);
  }
  let prev = satirlar.length ? satirlar[satirlar.length - 1] : null;
  const bas = prev ? sonrakiGun(prev.gun) : BASLANGIC;
  const ctx = { ilkKarar, kararBul: g => (g === ILK_KARAR ? null : kmap.get(g) || null) };
  for (const gun of gunler(tanim.takvim, bas, sonGun ? (sonGun < bugun ? sonGun : bugun) : bugun)) {
    if (aySonuMu(id, gun) && !kmap.has(gun)) {
      if (!kararUret) { out.veriNotu = `${id} ${gun} kararı defterde yok`; break; }
      const r = kararHesapla(id, gun, P);
      if (r.bekle) { out.veriNotu = r.bekle; break; }
      const k = kararEkle(r.kayit);
      if (k.eksikVeri && k.eksikVeri.length) out.uyarilar.push(`${id} ${gun} kararında verisi eksik/bayat üyeler (karar yalnız verili adaylarla): ${k.eksikVeri.map(x => `${x.s} (${x.neden})`).join(', ')}`);
      if (k.uyelik && k.uyelik.bayat) out.uyarilar.push(`${id} ${gun}: ${k.uyelik.uyari}`);
    }
    const r = adim(id, P, prev, gun, ctx);
    for (const d of r.dolum || []) out.dolumlar.push(etiketle({ tur: 'dolum', surum: 1, model: id, gun, ...d, durum: r.bekle ? 'acilis' : 'gun', karar: (prev && prev.karar) || (prev ? null : ILK_KARAR) }, etiket));
    if (r.atla) { out.uyarilar.push(`${id}: ${r.atla}`); continue; }
    if (r.bekle) { out.veriNotu = `${id}: ${r.bekle}`; break; }
    if (r.karar && !kmap.has(r.karar.kararGunu)) kararEkle(r.karar);
    const govde = etiketle({ tur: 'gun', surum: 1, model: id, gun, ...r.satir, getiri: R(r.satir.endeks / (prev ? prev.endeks : 100) - 1), ...(r.not && r.not.length ? { veriNotu: r.not.join(' · ') } : {}), onceki: prev ? prev.sha : null }, etiket);
    for (const k of Object.keys(govde)) if (govde[k] === undefined) delete govde[k];
    const satir = { ...govde, sha: DF.sha(govde) };
    out.satirlar.push(satir); prev = satir;
    if (r.not && r.not.length) out.notlar.push(`${id} ${gun}: ${r.not.join(' · ')}`);
  }
  return out;
}

/** Dondurulmuş satırları güncel veriyle baştan yeniden üret (yalnız defterdeki kararlarla) ve karşılaştır. */
function yenidenOynat(id, { P, satirlar = [], kararlar = [], etiket = { makine: DF.makine() }, tol = 1e-6 } = {}) {
  if (!satirlar.length) return { fark: [], kontrol: 0 };
  const son = satirlar[satirlar.length - 1].gun;
  const r = ilerlet(id, { P, satirlar: [], kararlar, bugun: son, sonGun: son, kararUret: false, etiket });
  const y = new Map(r.satirlar.map(s => [s.gun, s])), fark = [];
  for (const s of satirlar) {
    const z = y.get(s.gun);
    if (!z) { fark.push({ gun: s.gun, defter: s.endeks, yeniden: null, neden: r.veriNotu || 'yeniden üretilemedi' }); continue; }
    if (Math.abs(z.endeks / s.endeks - 1) > tol) fark.push({ gun: s.gun, defter: s.endeks, yeniden: z.endeks });
  }
  return { fark, kontrol: satirlar.length };
}

function metrik(satirlar, alan = 'endeks') {
  const s = satirlar.filter(x => Number.isFinite(x[alan]));
  if (!s.length) return { son: 100, toplam: 0, maxDD: 0, gun: 0, bas: null, bit: null };
  let tepe = 100, dd = 0;
  for (const x of s) { tepe = Math.max(tepe, x[alan]); dd = Math.max(dd, 1 - x[alan] / tepe); }
  const son = s[s.length - 1][alan];
  return { son, toplam: son / 100 - 1, maxDD: dd, gun: s.length, bas: s[0].gun, bit: s[s.length - 1].gun };
}

/**
 * qqq-cekirdek-uydu.js karisim(w) — takvim günü QQQ (ileri taşınmış) + Hücum zinciri; ay sonu w/(1−w), aktarım + kayma.
 * bant (sürüm 2, deneme 851 D2): { bant: 0.1, denetim: [bool] } → yalnız denetim[i] (QQQ işlem günü) kapanışında Hücum payı
 * (1−w) ± bant DIŞINDAYSA tam w/(1−w) (kavram-837.js sim + BANT_ISGUNU ile birebir). Varsayılan (bant yok) = ay sonu, değişmedi.
 */
function karisim837(zt, qc, he, { w = 0.5, aktarim = AKTARIM_837, kayma = KAYMA, bant = null, denetim = null } = {}) {
  let Qv = w * (1 - kayma), Hv = 1 - w, dengeleme = 0;
  const egri = [{ time: zt[0], oz: Qv + Hv }];
  for (let i = 1; i < zt.length; i++) {
    Qv *= qc[i] / qc[i - 1]; Hv *= he[i].oz / he[i - 1].oz;
    const zaman = bant != null ? !!(denetim && denetim[i]) && bantDisi(Qv, Hv, 1 - w, bant) : new Date(zt[i + 1]).getUTCMonth() !== new Date(zt[i]).getUTCMonth();
    if (i < zt.length - 1 && zaman) {
      const Vt = Qv + Hv, A = Math.abs(Qv - w * Vt), c = A * (aktarim + kayma); Qv = w * (Vt - c); Hv = (1 - w) * (Vt - c); dengeleme++;
    }
    egri.push({ time: zt[i], oz: Qv + Hv });
  }
  return { egri, dengeleme };
}

module.exports = {
  sabitleme, sabitlemeDosyasi, sabYolu, dengeleme837, bantDisi, modelSab, SERI, KIYAS_ESLE, MODELLER, SIRA, BASLANGIC, ILK_KARAR, KAYMA, AKTARIM_837, KESILME_GUN,
  piyasaKur, kararHesapla, ilerlet, yenidenOynat, metrik, karisim837, kararAnahtar, gunler, borsaAdi, R,
  _ic: { adim, kesilme, barTam, yayinAni, btcOku, qqqGun },
};
