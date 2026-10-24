'use strict';
/**
 * YAPAY ZEKÂ NOTLARI (74.1) — OKUNACAK KONULAR (yalnız dosya OKUR; hiçbir listeye / kurala / bota yazmaz).
 * ═══════════════════════════════════════════════════════════════════════════
 *   coin   · İZLE (deneme 781) resmî arşivin son günü, ilk 15 (sıra) — lib/tarama/izlePanel.liste
 *          · KAÇIN'a son 7 günde YENİ düşen en çok 5 (en yenisi önce; İZLE'dekiler hariç) — dikkat-ozet.json `yeniGiren`
 *   bist   · elde olanlar (Lydia kâğıt hesap + Portföyüm TL hisseler; lib/bildirimUreticileri eldekilerOku) + BIST 100 vekili
 *            (bist100Oku) en büyük `n` — kod listesi; KAP'ta o gün bildirimi olanlar okunur
 *   nasdaq · Nova (m-qqq-m10) + Simurg (m-837) kâğıt hesabının açık hisse pozisyonları (data/tasarimci/kagit.json)
 * Resmî arşiv yoksa (araştırma kopyası ya da ilk günler) coin listesi BOŞ döner — deneme kaydı kullanılmaz.
 */
const fs = require('fs');

const IZLE_N = 15, KACIN_N = 5, KACIN_GUN = 7;
const gunEkle = (g, n) => new Date(Date.parse(`${g}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** @returns { gun, kip, izle: [{ anahtar, sembol, kanat, ag, sira, liste: 'izle' }], kacin: [... liste: 'kacin', gun] , neden? } */
function coinKisaListe(o = {}) {
  try {
    const A = require('../tarama/arsiv');
    const IP = require('../tarama/izlePanel');
    const DP = require('../tarama/dikkatPanel');
    const taban = o.taramaDizin ? { dizin: o.taramaDizin } : {};
    const l = IP.liste(taban, 'resmi');
    const izle = (l.liste || []).slice().sort((a, b) => (a.sira || 999) - (b.sira || 999)).slice(0, IZLE_N)
      .filter(x => x && x.anahtar && x.sembol).map(x => ({ anahtar: String(x.anahtar), sembol: String(x.sembol), kanat: x.kanat || null, ag: x.ag || null, dilim: Number.isFinite(x.dilim) ? x.dilim : null, sira: x.sira || null, liste: 'izle' }));
    const kok = A.kokDizin({ ...taban, resmi: true });
    const gunler = DP.gunler(kok);
    const son = gunler[gunler.length - 1] || null;
    const kacin = [];
    if (son) {
      const sinir = gunEkle(son, -(KACIN_GUN - 1));
      const izleler = new Set(izle.map(x => x.anahtar));
      for (const g of gunler.slice().reverse()) {
        if (g < sinir || kacin.length >= KACIN_N) break;
        let oz = null;
        try { const b = A.dosyaOku(kok, `arsiv/${g}/dikkat-ozet.json`); oz = b ? JSON.parse(b.toString('utf8')) : null; } catch { oz = null; }
        for (const y of (oz && oz.yeniGiren) || []) {
          if (kacin.length >= KACIN_N) break;
          if (!y || !y.anahtar || !y.sembol || izleler.has(y.anahtar) || kacin.some(k => k.anahtar === y.anahtar)) continue;
          kacin.push({ anahtar: String(y.anahtar), sembol: String(y.sembol), kanat: y.kanat || null, ag: null, kapilar: (y.kapilar || []).slice(0, 6), gun: g, liste: 'kacin' });
        }
      }
    }
    return { gun: l.gun || son, kip: 'resmi', izle, kacin, neden: !izle.length && !kacin.length ? 'resmî dikkat / İZLE arşivi yok (sunucuda tarama birikince dolar)' : null };
  } catch (e) { return { gun: null, kip: 'resmi', izle: [], kacin: [], neden: `dikkat listesi okunamadı: ${String(e.message || e).slice(0, 160)}` }; }
}

/** @returns { elde: Map(kod → etiketler), bist100: string[], kaynak } */
async function bistKodlari(o = {}) {
  const BU = require('../bildirimUreticileri');
  let elde = new Map();
  try { elde = BU.eldeHaritasi(o.eldekiler ? o.eldekiler() : BU.eldekilerOku()); } catch { elde = new Map(); }
  let e = { kodlar: [], kaynak: 'yok' };
  try { e = await (o.bistEvren ? o.bistEvren() : BU.bist100Oku()); } catch { e = { kodlar: [], kaynak: 'yok' }; }
  const n = Number.isFinite(o.n) ? o.n : 30;
  return { elde, bist100: (e.kodlar || []).slice(0, n), kaynak: e.kaynak || 'yok' };
}

/** @returns [{ sembol, botlar: ['Nova', …] }] — ABD hisse sembolleri (kripto / BIST / nakit hariç). */
function nasdaqHisseleri(o = {}) {
  const yol = o.kagitYolu || require('../yollar').veri('tasarimci', 'kagit.json');
  let j = null;
  try { j = JSON.parse(fs.readFileSync(yol, 'utf8')); } catch { return []; }
  const BA = (() => { try { return require('../botAdlari'); } catch { return null; } })();
  const m = new Map();
  for (const id of ['m-qqq-m10', 'm-837']) {
    const ad = BA ? BA.ad(id) || id : id;
    for (const p of (((j.modeller || {})[id] || {}).pozisyonlar || [])) {
      const s = String((p && p.s) || '').toUpperCase();
      if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(s) || !(Number(p.adet) > 0) || /USDT$|^HUCUM$|^DENGE$/.test(s)) continue;
      const l = m.get(s) || [];
      if (!l.includes(ad)) l.push(ad);
      m.set(s, l);
    }
  }
  return [...m.entries()].map(([sembol, botlar]) => ({ sembol, botlar })).sort((a, b) => a.sembol.localeCompare(b.sembol));
}

module.exports = { coinKisaListe, bistKodlari, nasdaqHisseleri, IZLE_N, KACIN_N, KACIN_GUN };
