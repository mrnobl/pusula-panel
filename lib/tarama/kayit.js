/**
 * COIN TARAMA — kayıt deposu.
 *
 *   data/tarama/anlik/YYYY-MM.jsonl   YALNIZ EKLENİR: tarama × coin başına bir satır; her kaynağın durumu, zamanı, süresi ve
 *                                     HAM değerleri. Batan/kaybolan token da satır almaya devam eder (kaynak "bos" der);
 *                                     izlemeden çıkarılan coinin geçmiş satırları SİLİNMEZ.
 *   data/tarama/taramalar.jsonl       YALNIZ EKLENİR: tarama başına özet (neden, süre, kaynak başına ok/boş/hata/atlandı).
 *   data/tarama/durum.json            son tarama + son başarılı tarama zamanı (türetilmiş, üzerine yazılır).
 *   data/tarama/ozet.json             TÜRETİLMİŞ, yeniden üretilebilir: coin başına son metrikler, kısa seri, bayraklar
 *                                     (güncel eşiklerle). Silinirse `ozetUret()` ham kayıttan aynısını kurar.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { dizinler, satirEkle, satirlariOku, atomikYaz, jsonOku, kanonik, sha256 } = require('./ortak');
const { metrikler, bayraklar } = require('./bayraklar');

const SERI_UZUNLUK = 90;
const ILK_GORULME_TUR = 60;

class Kayit {
  constructor(o = {}) { this.D = dizinler(o); this.simdi = o.simdi || (() => Date.now()); }

  anlikDosya(zamanIso) { return path.join(this.D.anlikDizin, `${String(zamanIso).slice(0, 7)}.jsonl`); }
  satirYaz(row) { satirEkle(this.anlikDosya(row.zaman), row); }
  taramaYaz(t) { satirEkle(this.D.taramalar, t); }

  /** Tüm anlık satırlar (ay dosyaları sırayla). */
  tumSatirlar() {
    let dosyalar = [];
    try { dosyalar = fs.readdirSync(this.D.anlikDizin).filter(f => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort(); } catch { return { satirlar: [], bozuk: 0 }; }
    const out = []; let bozuk = 0;
    for (const f of dosyalar) { const r = satirlariOku(path.join(this.D.anlikDizin, f)); out.push(...r.satirlar); bozuk += r.bozuk; }
    out.sort((a, b) => String(a.zaman).localeCompare(String(b.zaman)));
    return { satirlar: out, bozuk };
  }

  /** Coin başına son satır (son iki ay dosyası yeter). */
  sonSatirlar() {
    let dosyalar = [];
    try { dosyalar = fs.readdirSync(this.D.anlikDizin).filter(f => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort().slice(-2); } catch { return new Map(); }
    const m = new Map();
    for (const f of dosyalar) for (const r of satirlariOku(path.join(this.D.anlikDizin, f)).satirlar) if (r && r.coin && r.coin.id) m.set(r.coin.id, r);
    return m;
  }

  coinGecmisi(id, limit = 30) {
    return this.tumSatirlar().satirlar.filter(r => r.coin && r.coin.id === id).slice(-limit).reverse();
  }

  taramalar(limit = 30) { return satirlariOku(this.D.taramalar).satirlar.slice(-limit).reverse(); }

  durumOku() { return jsonOku(this.D.durum, {}) || {}; }
  durumYaz(degisim) { const d = { ...this.durumOku(), ...degisim }; atomikYaz(this.D.durum, JSON.stringify(d, null, 2)); return d; }

  ozetOku() { return jsonOku(this.D.ozet, null); }

  /**
   * Ham kayıttan özet (güncel eşikler + yok sayılanlarla). "Yeni bayrak" = son satırda var, bir önceki satırda yok
   * (bir önceki satır yoksa ilk tarama: yeni sayılmaz).
   */
  ozetUret(ayar) {
    const { satirlar, bozuk } = this.tumSatirlar();
    const izleme = new Map((ayar.izleme || []).map(c => [c.id, c]));
    const grup = new Map();
    for (const r of satirlar) { if (!r || !r.coin || !r.coin.id) continue; if (!grup.has(r.coin.id)) grup.set(r.coin.id, []); grup.get(r.coin.id).push(r); }
    for (const c of izleme.values()) if (!grup.has(c.id)) grup.set(c.id, []);
    const coinler = [];
    for (const [id, rows] of grup) {
      const c = izleme.get(id) || null;
      const son = rows[rows.length - 1] || null;
      const seri = rows.map(r => ({ zaman: r.zaman, m: metrikler(r) }));
      const yokSay = new Set((c && c.yokSay) || []);
      const bu = bayraklar(seri, ayar.esikler, this.simdi());
      const once = seri.length >= 2 ? bayraklar(seri.slice(0, -1), ayar.esikler, Date.parse(seri[seri.length - 2].zaman) || this.simdi()) : null;
      const onceKod = new Set((once || []).map(b => b.kod));
      const bayrakList = bu.map(b => {
        let ilk = seri[seri.length - 1].zaman;
        for (let k = seri.length - 1, tur = 0; k >= 1 && tur < ILK_GORULME_TUR; k--, tur++) {
          const onceki = bayraklar(seri.slice(0, k), ayar.esikler, Date.parse(seri[k - 1].zaman) || this.simdi());
          if (onceki.some(x => x.kod === b.kod)) ilk = seri[k - 1].zaman; else break;
        }
        return { ...b, ilkGorulme: ilk, yeni: !!once && !onceKod.has(b.kod), yokSayildi: yokSay.has(b.kod) };
      });
      const m = son ? metrikler(son) : null;
      coinler.push({
        id, sembol: (c && c.sembol) || (son && son.coin.sembol) || id, ad: (c && c.ad) || (son && son.coin.ad) || null,
        ag: (c && c.ag) || (son && son.coin.ag) || null, sozlesme: (c && c.sozlesme) || (son && son.coin.sozlesme) || null,
        izlemede: !!c, aktif: c ? c.aktif !== false : false, belirsizlik: c ? c.belirsizlik : null, not: c ? c.not : null,
        satirSayisi: rows.length, ilkKayit: rows[0] ? rows[0].zaman : null,
        son: son ? {
          zaman: son.zaman, taramaId: son.taramaId,
          metrik: m ? { ...m, ilk10Adresler: undefined, siparisler: (m.siparisler || []).slice(0, 5) } : null,
          kaynaklar: Object.fromEntries(Object.entries(son.kaynaklar || {}).map(([k, v]) => [k, { durum: v.durum, hata: v.hata || null, neden: v.neden || null, alindi: v.alindi || null, kaynakZamani: v.kaynakZamani || null }])),
        } : null,
        seri: seri.slice(-SERI_UZUNLUK).map(s => ({ zaman: s.zaman, fiyat: s.m.fiyat, hacim24: s.m.hacim24, likidite: s.m.likidite, holder: s.m.holder, ilk10Ham: s.m.ilk10Ham, ilk10Ayk: s.m.ilk10Ayk, fiyatYok: s.m.fiyatYok })),
        bayraklar: bayrakList,
      });
    }
    coinler.sort((a, b) => (b.izlemede - a.izlemede) || String(a.sembol).localeCompare(String(b.sembol)));
    const ozet = { uretildi: new Date(this.simdi()).toISOString(), esikImza: sha256(kanonik(ayar.esikler)).slice(0, 12), satirSayisi: satirlar.length, bozukSatir: bozuk, coinler };
    atomikYaz(this.D.ozet, JSON.stringify(ozet));
    return ozet;
  }
}

module.exports = { Kayit, SERI_UZUNLUK };
