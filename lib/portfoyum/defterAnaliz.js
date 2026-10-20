/**
 * PORTFÖYÜM — İŞLEM DEFTERİ ANALİZİ (68.7, saf; ağa çıkmaz, dosya yazmaz) → GET /api/portfoyum/defter-analiz
 * ═══════════════════════════════════════════════════════════════════════════
 * Panel: İşlem defteri › Yatırım (js/pages/pano.js yatirimAnalizCiz). Seçili kişinin (portföy) ya da tek hesabın etkin
 * işlemlerinden (iptaller hariç, otomatik mevduat faizleri dahil):
 *   · gerçekleşen K/Z — satış başına FIFO (muhasebe.gerceklesenler; toplamı Varlıklar'daki "gerçekleşen K/Z" ile aynı), aylık + birikimli
 *   · varlığa göre (gerçekleşen, temettü, alış/satış sayısı ve tutarı, kazanan/kaybeden satış) ve hesaba göre
 *   · temettü + faiz geliri (vergi/stopaj sonrası net), alış / satış hacmi, para yatırma / çekme, ücretler — aylık
 * Para birimi: her tutar İŞLEM GÜNÜNÜN kuruyla USD ve TL'ye çevrilir (degerleme.cevirTarihte — /ozet ve /gecmis ile aynı kur
 * serisi); kuru olmayan tutar o birimin toplamına girmez ve `kurEksik` sayılır. Gizli kipi yalnız arayüzde (sayılar aynen gelir).
 * Para hareketi: yatırma/çekme + kümenin DIŞINDAKİ bir hesapla nakit transferi (ör. Ben → Fırat: Fırat'a giriş, Ben'den çıkış);
 * küme içi transfer hareket değildir. Açılış bakiyesi işlem sayılmaz. Bölünme hesapsızdır, sayılmaz.
 */
'use strict';
const M = require('./model');
const { cevirTarihte } = require('./degerleme');

const EPS = 1e-9;
const ikili = () => ({ usd: 0, tl: 0 });
const ayKey = (tarih) => String(tarih).slice(0, 7);

/** Bir ay sonrası "YYYY-AA". */
function sonrakiAy(ay) {
  let y = +ay.slice(0, 4), m = +ay.slice(5, 7) + 1;
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * @param D    depo.yukle().D
 * @param muh  depo.yukle().muh (gerceklesenler satış olayları)
 * @param ops  { kurlar (fiyat.kurSerileri), hesaplar?: [kimlik] (yoksa bütün hesaplar), bas?, bit? (YYYY-AA-GG) }
 */
function defterAnaliz(D, muh, ops = {}) {
  const kurlar = ops.kurlar || {};
  const kume = Array.isArray(ops.hesaplar) ? new Set(ops.hesaplar) : null;
  const ic = (h) => !kume || kume.has(h);
  const aralikta = (t) => (!ops.bas || t >= ops.bas) && (!ops.bit || t <= ops.bit);
  let kurEksik = 0;
  /** Tutar (kendi para biriminde) → { usd, tl } işlem günü kuruyla; çevrilemeyen birim null. */
  const cevir = (tutar, para, tarih) => {
    const d = cevirTarihte(tutar, para, M.gunMs(tarih), kurlar);
    if ((d.usd == null || d.tl == null) && Math.abs(tutar) > EPS) kurEksik++;
    return d;
  };
  const ekle = (h, d, isaret = 1) => { if (d.usd != null) h.usd += isaret * d.usd; if (d.tl != null) h.tl += isaret * d.tl; };

  const aylar = new Map();
  const ay = (tarih) => {
    const k = ayKey(tarih);
    if (!aylar.has(k)) aylar.set(k, { ay: k, gerceklesen: ikili(), satis: 0, kazanan: 0, kaybeden: 0, temettu: ikili(), faiz: ikili(), alis: ikili(), satisHacmi: ikili(),
      alisSayisi: 0, satisSayisi: 0, yatirma: ikili(), cekme: ikili(), komisyon: ikili(), gider: ikili() });
    return aylar.get(k);
  };
  const varliklar = new Map();
  const varlik = (id) => {
    if (!varliklar.has(id)) {
      const v = D.varliklar.get(id) || { id, sembol: id, ad: '', sinif: '', para: '' };
      varliklar.set(id, { varlik: id, sembol: v.sembol, ad: v.ad, sinif: v.sinif, para: v.para, gerceklesen: ikili(), gerceklesenKendi: 0, gelir: ikili(), gelirKendi: 0,
        alisSayisi: 0, satisSayisi: 0, alis: ikili(), satisHacmi: ikili(), kazanan: 0, kaybeden: 0, bilinmeyen: 0 });
    }
    return varliklar.get(id);
  };
  const hesaplar = new Map();
  const hesap = (id) => {
    if (!hesaplar.has(id)) {
      const h = D.hesaplar.get(id) || { id, ad: id };
      hesaplar.set(id, { hesap: id, ad: h.ad, portfoy: h.portfoy || M.VARSAYILAN_PORTFOY, gerceklesen: ikili(), gelir: ikili(), ucret: ikili(), yatirma: ikili(), cekme: ikili(),
        alisSayisi: 0, satisSayisi: 0 });
    }
    return hesaplar.get(id);
  };
  const toplam = { gerceklesen: ikili(), temettu: ikili(), faiz: ikili(), alis: ikili(), satisHacmi: ikili(), yatirma: ikili(), cekme: ikili(), komisyon: ikili(), gider: ikili(),
    satis: 0, kazanan: 0, kaybeden: 0, notr: 0, bilinmeyen: 0, alisSayisi: 0, satisSayisi: 0, islem: 0 };

  // ── İşlemler (etkin; D.islemler iptalleri içermez, otomatik faizler eklenmiş) ──
  for (const x of D.islemler) {
    if (!aralikta(x.tarih)) continue;
    const v = x.varlik ? D.varliklar.get(x.varlik) : null;
    const para = x.para || (v && v.para);
    if (x.islem === 'transfer') {
      if (x.varlik) continue;   // varlık aktarımı para hareketi değil (lotlar maliyetiyle taşınır)
      const kaynakIc = ic(x.hesap), hedefIc = ic(x.hedefHesap);
      if (kaynakIc === hedefIc) continue;   // küme içi (ya da tamamen dışarıda)
      toplam.islem++;
      if (hedefIc) { const t = Number.isFinite(x.ulasanTutar) ? x.ulasanTutar : x.tutar, d = cevir(t, para, x.tarih); ekle(ay(x.tarih).yatirma, d); ekle(toplam.yatirma, d); ekle(hesap(x.hedefHesap).yatirma, d); }
      else { const d = cevir(x.tutar, para, x.tarih); ekle(ay(x.tarih).cekme, d); ekle(toplam.cekme, d); ekle(hesap(x.hesap).cekme, d); }
      continue;
    }
    if (!x.hesap || !ic(x.hesap) || x.islem === 'acilis' || x.islem === 'bolunme') continue;
    toplam.islem++;
    const a = ay(x.tarih), h = hesap(x.hesap);
    switch (x.islem) {
      case 'al': case 'sat': {
        const brut = cevir(x.adet * x.fiyat, v.para, x.tarih), z = varlik(x.varlik);
        if (x.islem === 'al') { ekle(a.alis, brut); ekle(toplam.alis, brut); ekle(z.alis, brut); a.alisSayisi++; toplam.alisSayisi++; z.alisSayisi++; h.alisSayisi++; }
        else { ekle(a.satisHacmi, brut); ekle(toplam.satisHacmi, brut); ekle(z.satisHacmi, brut); a.satisSayisi++; toplam.satisSayisi++; z.satisSayisi++; h.satisSayisi++; }
        if (x.ucret) { const u = cevir(x.ucret, v.para, x.tarih); ekle(a.komisyon, u); ekle(toplam.komisyon, u); ekle(h.ucret, u); }
        break;
      }
      case 'temettu': case 'faiz': {
        const net = x.tutar - (x.vergi || 0), d = cevir(net, para, x.tarih);
        ekle(a[x.islem], d); ekle(toplam[x.islem], d); ekle(h.gelir, d);
        if (x.islem === 'temettu' && x.varlik) { const z = varlik(x.varlik); ekle(z.gelir, d); if (para === z.para) z.gelirKendi += net; }
        break;
      }
      case 'ucret': { const d = cevir(x.tutar, para, x.tarih); ekle(a.gider, d); ekle(toplam.gider, d); ekle(h.ucret, d); break; }
      case 'yatir': { const d = cevir(x.tutar, para, x.tarih); ekle(a.yatirma, d); ekle(toplam.yatirma, d); ekle(h.yatirma, d); break; }
      case 'cek': { const d = cevir(x.tutar, para, x.tarih); ekle(a.cekme, d); ekle(toplam.cekme, d); ekle(h.cekme, d); break; }
      default: break;
    }
  }

  // ── Gerçekleşen K/Z: satış olayları (FIFO, satış günü kuruyla) ──
  const satislar = (muh.gerceklesenler || []).filter(s => ic(s.hesap) && aralikta(s.tarih)).slice().sort((p, q) => (p.tarih < q.tarih ? -1 : p.tarih > q.tarih ? 1 : 0));
  const gunluk = new Map();
  for (const s of satislar) {
    const a = ay(s.tarih), z = varlik(s.varlik), h = hesap(s.hesap);
    const d = cevir(s.kzFifo, s.para, s.tarih);
    ekle(a.gerceklesen, d); ekle(toplam.gerceklesen, d); ekle(z.gerceklesen, d); ekle(h.gerceklesen, d);
    z.gerceklesenKendi += s.kzFifo;
    a.satis++; toplam.satis++;
    if (s.bilinmiyor) { toplam.bilinmeyen++; z.bilinmeyen++; }
    else if (s.kzFifo > EPS) { a.kazanan++; toplam.kazanan++; z.kazanan++; }
    else if (s.kzFifo < -EPS) { a.kaybeden++; toplam.kaybeden++; z.kaybeden++; }
    else toplam.notr++;
    const g = gunluk.get(s.tarih) || ikili(); ekle(g, d); gunluk.set(s.tarih, g);
  }
  // Birikimli çizgi: ilk satıştan bir gün önce 0, sonra her satış günü.
  const birikimli = [];
  if (gunluk.size) {
    const ilk = [...gunluk.keys()][0];
    const t0 = M.gunMs(ilk) - 864e5;
    birikimli.push({ tarih: M.msGun(t0), t: t0, usd: 0, tl: 0 });
    let u = 0, l = 0;
    for (const [tarih, g] of gunluk) { u += g.usd; l += g.tl; birikimli.push({ tarih, t: M.gunMs(tarih), usd: u, tl: l }); }
  }

  // Aylar: ilk ile son ay arası boşluksuz (çubuklar takvimle hizalı).
  const anahtarlar = [...aylar.keys()].sort();
  const aylik = [];
  if (anahtarlar.length) {
    for (let k = anahtarlar[0]; k <= anahtarlar[anahtarlar.length - 1]; k = sonrakiAy(k)) aylik.push(aylar.get(k) || ay(k + '-01'));
  }
  for (const a of aylik) a.ucret = { usd: a.komisyon.usd + a.gider.usd, tl: a.komisyon.tl + a.gider.tl };
  toplam.ucret = { usd: toplam.komisyon.usd + toplam.gider.usd, tl: toplam.komisyon.tl + toplam.gider.tl };
  toplam.kazanmaOrani = toplam.kazanan + toplam.kaybeden ? toplam.kazanan / (toplam.kazanan + toplam.kaybeden) : null;

  const sirala = (l) => l.sort((p, q) => Math.abs(q.gerceklesen.usd) + Math.abs(q.gelir.usd) - Math.abs(p.gerceklesen.usd) - Math.abs(p.gelir.usd));
  return {
    bas: ops.bas || null, bit: ops.bit || null,
    ilk: anahtarlar[0] || null, son: anahtarlar[anahtarlar.length - 1] || null,
    toplam, aylik, birikimli,
    varliklar: sirala([...varliklar.values()]),
    hesaplar: sirala([...hesaplar.values()]),
    kurEksik
  };
}

module.exports = { defterAnaliz, sonrakiAy };
