/**
 * PORTFÖY ÖLÇÜTLERİ — saf hesaplar (`AG.olcut`), yeni panel F4 (PLAN-PANEL-YENI §5)
 * ═══════════════════════════════════════════════════════════════════════════
 * Girdi: GET /api/portfoyum/gecmis serisi ({ tarih, usd, tl, endeksUSD, endeksTL, akisUSD }) — endeks TWR'dir (para giriş/çıkışı
 * getiriyi bozmaz). Seri TAKVİM günlüdür (hafta sonu dahil; kripto + hisse karışık portföy) → yıllıklaştırma 365 gün.
 * Risksiz faiz 0 varsayılır (Sharpe/Sortino ekranda böyle yazar). Veri yetmiyorsa ölçüt null döner ve `neden` söyler:
 *   oynaklık / Sharpe / Sortino ≥ 30 gün · Calmar / yıllık getiri ≥ 90 gün · aylık ölçütler ≥ 2 tam ay · yakalama ≥ 3 ortak ay.
 * Portföy sağlığı (örümcek ağı) altı eksen, her biri 0–100, EŞİT ağırlık; eşikler SAGLIK_ESIK'te ve kılavuzda yazılı.
 * DOM yok, ağ yok — scripts/panel-pano-testi.js Node'da sınar.
 */
(function (global) {
  'use strict';
  const AG = global.AG || (global.AG = {});
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const YIL = 365;
  const kirp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
  const ort = (l) => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
  const std = (l) => { if (l.length < 2) return null; const m = ort(l); return Math.sqrt(l.reduce((s, x) => s + (x - m) * (x - m), 0) / (l.length - 1)); };

  /** Endeks serisi (alan: 'endeksUSD' | 'endeksTL') → [{ tarih, e }] yalnız sayısal ve pozitif noktalar. */
  function endeks(seri, alan) {
    return (seri || []).filter(x => sayiMi(x[alan]) && x[alan] > 0).map(x => ({ tarih: x.tarih, e: x[alan] }));
  }

  /** Günlük getiriler. */
  function gunluk(E) { const r = []; for (let i = 1; i < E.length; i++) r.push(E[i].e / E[i - 1].e - 1); return r; }

  /** Düşüş serisi + en derin düşüş + en uzun düşüş süresi (gün) + şu an tepeden + Ulcer endeksi (yüzde puan). */
  function dusus(E) {
    if (!E.length) return { seri: [], enDerin: null, enUzunGun: null, simdi: null, ulcer: null, toparlanmaGun: null };
    let tepe = E[0].e, tepeI = 0, altta = false, enDerin = 0, enUzun = 0, kare = 0, derinI = 0, toparlanma = null;
    const seri = E.map((x, i) => {
      if (x.e >= tepe) { if (altta && i - tepeI > enUzun) enUzun = i - tepeI; tepe = x.e; tepeI = i; altta = false; } else altta = true;
      const d = x.e / tepe - 1;
      if (d < enDerin) { enDerin = d; derinI = i; }
      kare += (d * 100) * (d * 100);
      return { tarih: x.tarih, d };
    });
    const sonUzun = E.length - 1 - tepeI;
    if (altta && sonUzun > enUzun) enUzun = sonUzun;
    // En derin düşüşün dibinden eski tepeye dönüş süresi (dönmediyse null).
    if (enDerin < 0) {
      let t = 0; for (let i = 0; i <= derinI; i++) t = Math.max(t, E[i].e);
      for (let i = derinI; i < E.length; i++) if (E[i].e >= t) { toparlanma = i - derinI; break; }
    }
    return { seri, enDerin, enUzunGun: enUzun, simdi: seri[seri.length - 1].d, ulcer: Math.sqrt(kare / E.length), toparlanmaGun: toparlanma };
  }

  /** Ay sonu endeksinden aylık getiriler: [{ ay: 'YYYY-AA', r, tam }] — ilk ay (yarım) ve süren ay tam değil. */
  function aylik(E, bugun) {
    if (E.length < 2) return [];
    const sonlar = new Map();
    for (const x of E) sonlar.set(x.tarih.slice(0, 7), x);
    const aylar = [...sonlar.keys()];
    const out = [];
    let onceki = E[0];
    aylar.forEach((ay, i) => {
      const son = sonlar.get(ay);
      out.push({ ay, r: son.e / onceki.e - 1, tam: i > 0 && !(bugun && ay === String(bugun).slice(0, 7)) });
      onceki = son;
    });
    return out;
  }

  /** Kıyas (100 tabanlı [[t, v]]) → ay sonu getirileri Map(ay → r). */
  function kiyasAylik(noktalar) {
    const sonlar = new Map();
    for (const [t, v] of noktalar || []) if (sayiMi(v)) sonlar.set(new Date(t).toISOString().slice(0, 7), v);
    const out = new Map(); let onceki = null;
    for (const [ay, v] of sonlar) { if (onceki != null) out.set(ay, v / onceki - 1); onceki = v; }
    return out;
  }

  /**
   * Bütün ölçütler. seri: /gecmis; o: { birim: 'USD'|'TL', bugun, kiyas: { qqq: noktalar }, deg: { pozisyonlar, nakitler, toplamUSD },
   * dagilim: { hedefVar, dilimler }, islemler: Portföyüm işlemleri (ücret oranı), hesaplar (sıradaki faiz) }.
   */
  function hesapla(seri, o = {}) {
    const alan = o.birim === 'TL' ? 'endeksTL' : 'endeksUSD';
    const E = endeks(seri, alan);
    const r = gunluk(E);
    const gun = E.length ? Math.round((Date.parse(E[E.length - 1].tarih) - Date.parse(E[0].tarih)) / 864e5) : 0;
    const toplamGetiri = E.length > 1 ? E[E.length - 1].e / E[0].e - 1 : null;
    const yeter = (n) => gun >= n;
    const s = std(r);
    const oynaklik = yeter(30) && s != null ? s * Math.sqrt(YIL) : null;
    const yillikOrt = r.length ? ort(r) * YIL : null;
    const asagi = r.filter(x => x < 0);
    const asagiStd = asagi.length > 1 ? Math.sqrt(asagi.reduce((t, x) => t + x * x, 0) / r.length) * Math.sqrt(YIL) : null;
    const yillik = yeter(90) && toplamGetiri != null ? Math.pow(1 + toplamGetiri, YIL / gun) - 1 : null;
    const dd = dusus(E);
    const ay = aylik(E, o.bugun).filter(x => x.tam);
    const kazanan = ay.filter(x => x.r > 0).length;
    // Yakalama: QQQ'nun yükseldiği/düştüğü aylarda portföyün ortalama getirisi ÷ QQQ'nunki.
    let yukari = null, asagiY = null;
    const q = o.kiyas && o.kiyas.qqq ? kiyasAylik(o.kiyas.qqq) : null;
    if (q) {
      const ortak = ay.filter(x => q.has(x.ay)).map(x => ({ p: x.r, q: q.get(x.ay) }));
      if (ortak.length >= 3) {
        const up = ortak.filter(x => x.q > 0), dn = ortak.filter(x => x.q < 0);
        yukari = up.length ? ort(up.map(x => x.p)) / ort(up.map(x => x.q)) : null;
        asagiY = dn.length ? ort(dn.map(x => x.p)) / ort(dn.map(x => x.q)) : null;
      }
    }
    // Bugünkü yapı: yoğunlaşma (en büyük 3 pay, HHI), boşta nakit, gelecek gelir.
    const deg = o.deg || {};
    const toplam = sayiMi(deg.toplamUSD) && deg.toplamUSD > 0 ? deg.toplamUSD : null;
    const kalemler = new Map();
    for (const p of deg.pozisyonlar || []) if (sayiMi(p.degerUSD) && p.degerUSD > 0) kalemler.set(p.varlik, (kalemler.get(p.varlik) || 0) + p.degerUSD);
    for (const n of deg.nakitler || []) if (sayiMi(n.degerUSD) && n.degerUSD > 0) kalemler.set('$' + n.para, (kalemler.get('$' + n.para) || 0) + n.degerUSD);
    const paylar = toplam ? [...kalemler.values()].map(v => v / toplam).sort((a, b) => b - a) : [];
    const hhi = paylar.length ? paylar.reduce((t, x) => t + x * x, 0) : null;
    const ilk3 = paylar.length ? paylar.slice(0, 3).reduce((t, x) => t + x, 0) : null;
    const faizliHesap = new Set((o.hesaplar || []).filter(h => h.faiz && h.faiz.oran > 0).map(h => h.id));
    const bostaNakit = toplam ? (deg.nakitler || []).filter(n => !faizliHesap.has(n.hesap) && sayiMi(n.degerUSD)).reduce((t, n) => t + Math.max(0, n.degerUSD), 0) / toplam : null;
    // Ücret oranı: son 365 günün ücret + alım/satım komisyonu (USD karşılığı yaklaşık: işlem para birimi USD değilse kur ile) ÷ bugünkü toplam.
    let ucret = null;
    if (toplam && Array.isArray(o.islemler)) {
      const sinir = o.bugun ? new Date(Date.parse(o.bugun) - YIL * 864e5).toISOString().slice(0, 10) : '0000';
      const kur = o.usdtry || null;
      let t = 0;
      for (const x of o.islemler) {
        if (x._iptal || x.iptal || x.tarih < sinir) continue;
        const tutar = x.islem === 'ucret' ? x.tutar : (x.islem === 'al' || x.islem === 'sat') ? (x.ucret || 0) : 0;
        if (!sayiMi(tutar) || !tutar) continue;
        const para = x.para || 'USD';
        t += para === 'USD' ? tutar : para === 'TRY' && kur ? tutar / kur : 0;
      }
      ucret = t / toplam;
    }
    const gelir = (o.hesaplar || []).filter(h => h.faizSiradaki).map(h => ({ hesap: h.ad, ...h.faizSiradaki }));
    return {
      gun, birim: o.birim === 'TL' ? 'TL' : 'USD', toplamGetiri, yillik,
      oynaklik, sharpe: oynaklik ? yillikOrt / oynaklik : null, sortino: yeter(30) && asagiStd ? yillikOrt / asagiStd : null,
      calmar: yillik != null && dd.enDerin < 0 ? yillik / Math.abs(dd.enDerin) : null,
      enDerinDusus: dd.enDerin, simdiDusus: dd.simdi, enUzunDususGun: dd.enUzunGun, toparlanmaGun: dd.toparlanmaGun, ulcer: dd.ulcer, dususSeri: dd.seri,
      aylar: aylik(E, o.bugun), kazananAyOrani: ay.length >= 2 ? kazanan / ay.length : null, tamAy: ay.length,
      enIyiAy: ay.length ? ay.reduce((m, x) => (x.r > m.r ? x : m)) : null, enKotuAy: ay.length ? ay.reduce((m, x) => (x.r < m.r ? x : m)) : null,
      yukariYakalama: yukari, asagiYakalama: asagiY,
      ilk3Pay: ilk3, hhi, bostaNakit, ucretOrani: ucret, gelecekGelir: gelir,
      neden: {
        kisa: gun < 30 ? `Seri ${gun} gün — oynaklık, Sharpe ve Sortino için en az 30 gün gerekir.` : gun < 90 ? `Seri ${gun} gün — yıllık getiri ve Calmar için en az 90 gün gerekir.` : null,
        yakalama: q && yukari == null ? 'Yakalama için QQQ ile en az 3 ortak tam ay gerekir.' : null
      }
    };
  }

  /**
   * PORTFÖY SAĞLIĞI (örümcek ağı) — altı eksen, 0–100, eşit ağırlık. Eşikler (kılavuzda da yazılı):
   *   getiri     kıyasa (QQQ, aynı dönem) fark: −20 puan → 0, 0 → 50, +20 puan → 100
   *   dusus      en derin düşüş: %0 → 100, −%40 → 0
   *   cesitlilik HHI: 1 (tek varlık) → 0, ≤ 0,15 → 100
   *   nakit      boşta (faizsiz) nakit oranı: %0 → 100, %50 → 0
   *   maliyet    yıllık ücret ÷ portföy: %0 → 100, %2 → 0
   *   hedef      toplam sapma (Σ|gerçek − hedef| ÷ 2): 0 → 100, %50 → 0; hedef yoksa 0 ("hedef seç")
   * Ölçülemeyen eksen null (puana girmez, ekranda "veri yok").
   */
  const SAGLIK_ESIK = { getiriPuan: 0.20, dusus: 0.40, hhiIyi: 0.15, nakit: 0.50, ucret: 0.02, sapma: 0.50 };
  const SAGLIK_EKSEN = [['getiri', 'Getiri (kıyasa)'], ['dusus', 'Düşük düşüş'], ['cesitlilik', 'Çeşitlilik'], ['nakit', 'Nakit verimi'], ['maliyet', 'Düşük maliyet'], ['hedef', 'Hedefe yakınlık']];
  function saglik(ol, o = {}) {
    const E = SAGLIK_ESIK;
    const kiyas = sayiMi(o.kiyasGetiri) && sayiMi(ol.toplamGetiri) ? ol.toplamGetiri - o.kiyasGetiri : null;
    const dag = o.dagilim || {};
    let sapma = null;
    if (dag.hedefVar) sapma = (dag.dilimler || []).reduce((t, d) => t + Math.abs((d.gercek || 0) - (d.hedef || 0)), 0) / 2;
    const p = {
      getiri: kiyas == null ? null : kirp(50 + kiyas / E.getiriPuan * 50),
      dusus: sayiMi(ol.enDerinDusus) ? kirp(100 - Math.abs(ol.enDerinDusus) / E.dusus * 100) : null,
      cesitlilik: sayiMi(ol.hhi) ? kirp((1 - ol.hhi) / (1 - E.hhiIyi) * 100) : null,
      nakit: sayiMi(ol.bostaNakit) ? kirp(100 - ol.bostaNakit / E.nakit * 100) : null,
      maliyet: sayiMi(ol.ucretOrani) ? kirp(100 - ol.ucretOrani / E.ucret * 100) : null,
      hedef: dag.hedefVar ? kirp(100 - sapma / E.sapma * 100) : (o.dagilim ? 0 : null)
    };
    const olculen = Object.values(p).filter(sayiMi);
    return { eksenler: SAGLIK_EKSEN.map(([k, ad]) => ({ k, ad, puan: p[k] })), puan: olculen.length ? Math.round(ort(olculen)) : null, hedefYok: !!o.dagilim && !dag.hedefVar };
  }

  /** Takvim: günlük K/Z = bugünkü değer − dünkü değer − dış akış (para girişi getiri değil). alan: 'usd' | 'tl'. */
  function gunlukKz(seri, alan = 'usd') {
    const akis = alan === 'tl' ? 'akisTL' : 'akisUSD';
    const out = new Map();
    for (let i = 1; i < (seri || []).length; i++) {
      const a = seri[i - 1], b = seri[i];
      if (!sayiMi(a[alan]) || !sayiMi(b[alan]) || b.eksik) continue;
      out.set(b.tarih, b[alan] - a[alan] - (sayiMi(b[akis]) ? b[akis] : 0));
    }
    return out;
  }

  AG.olcut = { hesapla, saglik, dusus, aylik, gunluk, endeks, kiyasAylik, gunlukKz, SAGLIK_ESIK, SAGLIK_EKSEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.olcut;
})(typeof window !== 'undefined' ? window : globalThis);
