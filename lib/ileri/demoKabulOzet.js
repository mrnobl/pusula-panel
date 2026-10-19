/**
 * DEMO KABUL — ARA DURUM ÖZETİ (salt okur) · Pusula P4 "İleri test" ekranı
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PLAN-DEMO-KABUL.md (ön-kayıt 2026-10-07) ölçütlerinin BUGÜNKÜ durumunu betimler:
 * gün sayacı, aşama tarihleri (30 g ara rapor · 63 g HÜKÜM · 126 g uzatma · 252 g izleme),
 * betimleyici getiri / MaxDD / oynaklık ve 63 g kabul bandı, uygulama sapması bandı (U1),
 * durdurma (ENGEL) ve kaçırılan gün. HÜKÜM YAZMAZ: protokol hükmü 63. günde ve §8'deki
 * rapor betiğiyle verilir (scripts/demo-kabul-rapor.js; eşikler lib/ileri/demoKabulEsikleri.js). Ara raporda "geçti/kaldı" denmez.
 *
 * lib/live'a DOKUNMAZ: yalnız botun kendi yazdığı dosyaları okur
 * (data/live/hucum-demo/{ozsermaye.jsonl, bindirme-bot.json, kalp.json}) ve bant dosyasını
 * (data/arastirma/demo-kabul-bantlari.json, scripts/demo-kabul-bantlari.js üretir).
 *
 * GÜN 0 (§1): TradFi düzeltmesi yüklüyken yapılan ilk günlük çalışma. 2026-10-06 çalışması
 * sayılmaz → Gün 0 = 2026-10-07 ve sonrasındaki İLK özsermaye kaydının günü. Kayıt yoksa
 * (bu makinede bot çalışmıyor) Gün 0 "henüz yok" — tarih uydurulmaz.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');

const { botSermayesiTabani } = require('../live/islemGecmisi');   // salt hesap (panel türetimi) — bot davranışı değil

const KOK = path.join(__dirname, '..', '..');
const GUN0_TABAN = '2026-10-07';
const ASAMALAR = Object.freeze([
  { gun: 30, ad: 'Faz 1 — ara rapor', hukum: false },
  { gun: 63, ad: 'Faz 2 — protokol hükmü', hukum: true },
  { gun: 126, ad: 'Uzatma — "ölçülemedi" kalanlar', hukum: false },
  { gun: 252, ad: 'İzleme — getiri bantları', hukum: false }
]);
const GUN = 864e5;
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);
const gunEkle = (g, n) => gunStr(Date.parse(g + 'T00:00:00Z') + n * GUN);
const zamanMs = (z, gun) => (typeof z === 'number' ? z : (z ? Date.parse(z) : Date.parse(`${gun}T23:59:59Z`)));

function jsonOku(dosya) { try { return JSON.parse(fs.readFileSync(dosya, 'utf8')); } catch (e) { return null; } }
function jsonlOku(dosya) {
  let metin;
  try { metin = fs.readFileSync(dosya, 'utf8'); } catch (e) { return []; }
  const out = [];
  for (const satir of metin.split('\n')) { if (!satir.trim()) continue; try { out.push(JSON.parse(satir)); } catch (e) { /* bozuk satır atlanır */ } }
  return out;
}

/**
 * Özsermaye kayıtlarından betimleyici ölçüler (bileşik getiri, MaxDD, yıllık oynaklık √365).
 * 67.5: BOT DEĞERİ üstünden (lib/live/islemGecmisi.botSermayesiTabani — panelin "Bot değeri" eğrisiyle aynı tanım):
 * hesap tavandan büyükse bot_t = tavan₀ + (E_t − E₀) − akışlar. Eskiden min(E, tavan) kullanılıyordu; demo hesap 4.938 $,
 * tavan 1.000 $ olunca her gün tam 1.000 → getiri / MaxDD / oynaklık hep 0 çıkıyordu.
 * @param kayitlar gün başına bir özsermaye satırı (sıralı)
 * @param akislar bot.sermayeAkislari [{zaman, tutar}] (isteğe bağlı; ilk satırdan sonraki yatırma/çekme düşülür)
 */
function olculer(kayitlar, akislar = []) {
  const s = (kayitlar || []).filter(k => Number(k.ozsermaye) > 0);
  if (s.length < 2) return null;
  const T = botSermayesiTabani(s[0]);
  const t0 = zamanMs(s[0].zaman, s[0].gun);
  const akisL = (Array.isArray(akislar) ? akislar : []).filter(a => a && Number.isFinite(+a.zaman) && Number.isFinite(+a.tutar));
  const d = s.map((k, i) => {
    const t = zamanMs(k.zaman, k.gun);
    const akis = i > 0 ? akisL.filter(a => +a.zaman > t0 && +a.zaman <= t).reduce((a, x) => a + +x.tutar, 0) : 0;
    return T.deger(Number(k.ozsermaye), akis);
  }).filter(x => Number.isFinite(x) && x > 0);
  if (d.length < 2) return null;
  let tepe = d[0], maxdd = 0;
  const r = [];
  for (let i = 1; i < d.length; i++) {
    r.push(d[i] / d[i - 1] - 1);
    tepe = Math.max(tepe, d[i]);
    maxdd = Math.max(maxdd, 1 - d[i] / tepe);
  }
  const ort = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = r.length > 1 ? Math.sqrt(r.reduce((a, b) => a + (b - ort) ** 2, 0) / (r.length - 1)) : null;
  return { getiri: d[d.length - 1] / d[0] - 1, maxdd, vol: sd == null ? null : sd * Math.sqrt(365), gun: d.length };
}

/**
 * @param {object} o { dizin, bantDosya, bugun (ms), strateji: 'hucum'|'denge' }
 */
function ozet(o = {}) {
  const dizin = o.dizin || yollar.veri('live', 'hucum-demo');
  const bantDosya = o.bantDosya || yollar.veri('arastirma', 'demo-kabul-bantlari.json');
  const bugun = gunStr(o.bugun || Date.now());
  const strateji = o.strateji || 'hucum';

  // Gün başına SON satır (bot aynı gün telafi/yeniden çalışmada ikinci satır yazabilir — bindirmeBot.js ile aynı kural).
  const gunluk = new Map();
  for (const k of jsonlOku(path.join(dizin, 'ozsermaye.jsonl'))) {
    const gun = k.gun || (k.zaman ? gunStr(typeof k.zaman === 'number' ? k.zaman : Date.parse(k.zaman)) : null);
    if (gun && gun >= GUN0_TABAN) gunluk.set(gun, { ...k, gun });
  }
  const kayitlar = [...gunluk.values()].sort((a, b) => (a.gun < b.gun ? -1 : 1));
  const gun0 = kayitlar.length ? kayitlar[0].gun : null;
  const gecenGun = gun0 ? Math.max(0, Math.round((Date.parse(bugun) - Date.parse(gun0)) / GUN)) : 0;
  const asamalar = ASAMALAR.map(a => ({ ...a, tarih: gun0 ? gunEkle(gun0, a.gun) : null, kalanGun: gun0 ? Math.max(0, a.gun - gecenGun) : null, gecti: gun0 ? gecenGun >= a.gun : false }));
  const hukumAsamasi = asamalar.find(a => a.hukum);

  const bot = jsonOku(path.join(dizin, 'bindirme-bot.json')) || {};
  const kalp = jsonOku(path.join(dizin, 'kalp.json')) || {};
  const farklar = Array.isArray(bot.golgeFarklar) ? bot.golgeFarklar : [];
  const sonFark = farklar.length ? farklar[farklar.length - 1] : null;

  const bantlar = jsonOku(bantDosya);
  const kb = bantlar && bantlar.strateji && bantlar.strateji[strateji] && bantlar.strateji[strateji].kabulBandi;
  const bant = (u) => (kb && kb[u] ? { ufuk: u, getiriP5: kb[u].getiri.p5, maxddP95: kb[u].maxdd.p95, maxddP99: kb[u].maxdd.p99, volP5: kb[u].vol.p5, volP95: kb[u].vol.p95 } : null);
  // Betimleme için en yakın (geçilmemiş) ufkun bandı; hükümde 63 g bandı kullanılır.
  const ufuk = gecenGun <= 63 ? 63 : gecenGun <= 126 ? 126 : 252;

  return {
    plan: 'PLAN-DEMO-KABUL.md',
    strateji,
    veriVar: kayitlar.length > 0,
    gun0, gun0Taban: GUN0_TABAN, gecenGun, bugun,
    asamalar,
    hukumTarihi: hukumAsamasi ? hukumAsamasi.tarih : null,
    olcu: olculer(kayitlar, bot.sermayeAkislari),
    bant: bant(ufuk),
    uygulama: {
      sonBant: bot.sonBant || null,
      sonFark: sonFark && Number.isFinite(+sonFark.fark) ? +sonFark.fark : null,
      pencere: sonFark ? { bas: sonFark.bas || null, bit: sonFark.bit || null } : null,
      // 63.1 (panel grafiği): 30 günlük uygulama sapmasının seyri ve önceden yazılmış eşikler (incele / engel).
      seri: farklar.filter(x => Number.isFinite(+x.fark)).map(x => ({ gun: x.bit || x.gun || x.bas || null, fark: +x.fark })).filter(x => x.gun),
      esik: (() => { try { const U = require('./hucumDengeEsikleri').UYGULAMA; return { incele: U.incele, engel: U.engel }; } catch { return null; } })(),
      engel: !!bot.engel
    },
    // Denetim A-14: bot çalışıyor mu (bindirme-bot.json) — Gün 0 neden başlamadı sorusunun cevabı.
    calisma: { calisiyor: !!bot.calisiyor, botMod: bot.mod || null, mod: kalp.mod || null, zaman: kalp.zaman || null, kararGun: kalp.kararGun || null, kacirilanGun: Number.isFinite(+kalp.kacirilanGun) ? +kalp.kacirilanGun : null, hata: kalp.hata || null },
    not: 'Ara durum — hüküm değil. Protokol hükmü 63. günde birincil ölçütlerle (uygulama, mutabakat, alarm, felaket stopu, marj, kaçırılan gün) verilir; getiri ve Sharpe hükme girmez.'
  };
}

module.exports = { ozet, olculer, ASAMALAR, GUN0_TABAN };
