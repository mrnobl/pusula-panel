/**
 * DEMO KABUL RAPORU — ÇEKİRDEK (saf hesap, SALT OKUR) · PLAN-DEMO-KABUL.md §8 (ön-kayıt 2026-10-07)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 64.4: scripts/demo-kabul-rapor.js'in hesabı buraya taşındı; komut satırı ve panel (İleri test › Demo kabul kartı,
 * GET /api/ileri/kabul-rapor) AYNI kodu çalıştırır, mantık kopyalanmaz.
 *
 *   rapor(o)        → komut satırıyla birebir aynı rapor nesnesi (eşzamanlı). AĞ YOK: prod günlük mum referansı
 *                     (U4 kayma a) yalnız yerel önbellekten (data/arastirma/demo-kabul-ref.json) okunur; önbellek yoksa
 *                     U4 ÖLÇÜLEMEDİ. Ağdan tamamlama (`--ag`) yalnız komut satırındadır.
 *   raporAdimlari(o) → üreteç: referans ihtiyacını `yield { istek, refDosya }` ile sorar, `{ ref, hata }` bekler.
 *                     Komut satırı bunu ağlı sürücüyle, `rapor` yerel sürücüyle çalıştırır.
 *   panelOzet(o)    → panel kartının özeti (ölçüt tablosu, aşama, §8.2 kapsamı, prova günlüğü). HÜKÜM yalnız 63. günden
 *                     sonra; öncesinde "ara rapor — hüküm yok" ve ölçüt durumları "… bandında" yazılır (§0.4).
 *
 * Hiçbir fonksiyon dosya YAZMAZ (data/arastirma/demo-kabul-rapor-<gün>.json'u yalnız komut satırı yazar).
 * Eşikler TEK KAYNAKTAN: ./demoKabulEsikleri.js (dondurulmuş). Burada eşik sayısı YOK.
 * Getiri, Sharpe ve BTC al-tut kıyası hükme girmez (§0.3). Prova aralıkları ölçümden hariç (§0.5).
 *
 * Okur: D = o.dizin (varsayılan data/live/hucum-demo): bindirme-bot.json, kalkan-bot.json, koruma.json, risk-durum.json,
 * ozsermaye.jsonl, emirler.jsonl, kalp.json ve §8.2 kayıtları (alarmlar · marj · mutabakat · golge-farklar · sapma ·
 * koruma .jsonl; lib/live/bindirmeBot.js yazar, 2026-10-15'ten sonra); data/live/hesap-islemleri.jsonl (H);
 * data/live/alarmlar.jsonl (sunucu bildirimleri); data/supervisor.log; data/ileri/bindirme-golge.jsonl;
 * prova günlüğü (varsayılan D/prova-gunlugu.json).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const E = require('./demoKabulEsikleri');
const I = require('../live/isletim');
const { olculer } = require('./demoKabulOzet');

const KOK = path.join(__dirname, '..', '..');
const GUN = 864e5;
const SAAT = 3600e3;
const H = E.HUKUM;
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);
const gunMs = (g) => Date.parse(`${g}T00:00:00Z`);
const gunEkle = (g, n) => gunStr(gunMs(g) + n * GUN);
const sayi = (x) => (x == null || x === '' ? null : (Number.isFinite(+x) ? +x : null));
const zamanMs = (z) => (typeof z === 'number' ? z : (z ? Date.parse(z) : NaN));

// ── Okuma (bozuk/boş satır toleranslı) ─────────────────────────────────────
function jsonOku(dosya) { try { return JSON.parse(fs.readFileSync(dosya, 'utf8').replace(/^﻿/, '')); } catch { return null; } }
function jsonlOku(dosya) {
  let metin; try { metin = fs.readFileSync(dosya, 'utf8'); } catch { return null; }   // null = dosya yok
  const out = [];
  for (const s of metin.split('\n')) { if (!s.trim()) continue; try { const x = JSON.parse(s); if (x && typeof x === 'object') out.push(x); } catch { /* yarım satır */ } }
  return out;
}

/** Emir defteri (yazım-önce günlüğü): aynı kimliğin satırları birleşir (lib/live/defter.js ile aynı kural). */
function defterOku(dosya) {
  const m = new Map();
  for (const k of jsonlOku(dosya) || []) {
    if (k.tur === 'sayac' || !k.id) continue;
    m.set(k.id, { ...(m.get(k.id) || {}), ...k });
  }
  for (const e of m.values()) if (e.durum === 'GONDERILIYOR') e.durum = 'BILINMIYOR';
  return m;
}

/** data/supervisor.log: "[Sal 13.10.2026  1:45:28,05] Node sonlandi - cikis kodu 1" (Türkiye saati, UTC+3). */
function supervisorOku(dosya) {
  let metin; try { metin = fs.readFileSync(dosya, 'utf8'); } catch { return null; }
  const out = [];
  for (const s of metin.split(/\r?\n/)) {
    const m = /^\[(?:\S+\s+)?(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})[,.]\d+\]\s*(.*)$/.exec(s.trim());
    if (!m) continue;
    const zaman = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 3, +m[5], +m[6]);
    const kod = /cikis kodu (-?\d+)/.exec(m[7]);
    out.push({ zaman, metin: m[7].trim(), kod: kod ? +kod[1] : null });
  }
  return out;
}

/** Supervisor çıkış kodları (67.5). */
const KOD_ACILAMADI = -1073741205;   // 0xC000026B STATUS_DLL_INIT_FAILED_LOGOFF — oturum kapanırken node hiç başlatılamadı
const KOD_SONLANDIRILDI = 1073807364; // 0x40010004 DBG_TERMINATE_PROCESS — sistem kapanışı / oturum sonu süreçleri öldürdü
const OLAY_ARALIK = 60e3;            // 1 dk içindeki ardışık sonlanma satırları tek olay
/**
 * "Node sonlandi" satırlarını olaylara böler ve sınıflar (saf):
 *   · 0 / 75 hiç olay değil (temiz çıkış / panelden yeniden başlat)
 *   · 1 dk içindeki ardışık sonlanmalar TEK olay (denetleyici yeniden denerken arka arkaya düşer)
 *   · olayda 1073807364 var ve sonrasında yeni "Denetleyici baslatildi" geldi → 'sistem-kapanisi' (çökme değil)
 *   · olaydaki kodların hepsi -1073741205 → 'sayilmayan' (node hiç açılamadı)
 *   · aksi halde → 'cokme' (gerçek aday: kod 1, -1 vb.)
 * @returns [{ zaman, kod (olayın belirleyici kodu), kodlar: [benzersiz], satir: n, sinif }]
 */
function supervisorOlaylari(sup) {
  const l = (sup || []).filter(s => /Node sonlandi/.test(s.metin) && s.kod != null && s.kod !== 0 && s.kod !== 75).sort((a, b) => a.zaman - b.zaman);
  const gruplar = [];
  for (const s of l) {
    const g = gruplar[gruplar.length - 1];
    if (g && s.zaman - g.son <= OLAY_ARALIK) { g.satirlar.push(s); g.son = s.zaman; } else gruplar.push({ satirlar: [s], son: s.zaman });
  }
  return gruplar.map(g => {
    const kodlar = [...new Set(g.satirlar.map(s => s.kod))];
    const zaman = g.satirlar[0].zaman;
    const gercek = kodlar.filter(k => k !== KOD_ACILAMADI && k !== KOD_SONLANDIRILDI);
    const yeniDenetleyici = (sup || []).some(s => s.zaman >= g.son && /Denetleyici baslatildi/.test(s.metin));
    let sinif, kod;
    if (kodlar.includes(KOD_SONLANDIRILDI) && yeniDenetleyici && !gercek.length) { sinif = 'sistem-kapanisi'; kod = KOD_SONLANDIRILDI; }
    else if (!gercek.length && !kodlar.includes(KOD_SONLANDIRILDI)) { sinif = 'sayilmayan'; kod = KOD_ACILAMADI; }
    else { sinif = 'cokme'; kod = gercek.length ? gercek[0] : KOD_SONLANDIRILDI; }
    return { zaman, kod, kodlar, satir: g.satirlar.length, sinif };
  });
}

/** I9 sabit bilgi notu (eşik/hüküm değişmez; panelde de gösterilir). */
const I9_BILGI = 'Bilinen model–canlı farkı: model zorunlu olmayan yeniden ölçeklemeyi %10 bant içinde yapmaz, canlı bot yapar (kullanıcı kararı 2026-10-19: test süresince değiştirilmedi). Bu oranın bir kısmı bu farktan.';

// ── Prova günlüğü ─────────────────────────────────────────────────────────
const PROVA_SABLON = {
  aciklama: 'PLAN-DEMO-KABUL §5 prova günlüğü — kullanıcı doldurur. Zamanlar ISO (ör. 2026-10-20T12:00:00+03:00). Prova aralığı ölçümden hariç tutulur.',
  provalar: [{ no: 1, bas: '2026-10-20T12:00:00+03:00', bit: '2026-10-20T13:30:00+03:00', adimlar: 'en küçük stop elle iptal edildi', gozlenen: '42 dk sonra yeniden kondu, Telegram geldi', sure: '42 dk', hukum: 'geçti' }],
  aciklamalar: [{ olcut: 'I3', gun: '2026-10-25', neden: 'sunucunun internet kesintisi (dış olay)', icerir: 'günlük çalışma yapılamadı' }],
  incelemeler: [{ olcut: 'U1', neden: 'yazılı neden analizi', kapatildi: false, duzeltmeGun: null }],
  surumOlaylari: [{ gun: '2026-10-15', surum: '64.x', not: 'demo kabul kayıtları eklendi (lib/live)' }],
  onaylar: { C3: false },
};

function provaYukle(dosya) {
  const p = (dosya && jsonOku(dosya)) || {};
  const provalar = (Array.isArray(p.provalar) ? p.provalar : []).map(x => ({ ...x, basMs: zamanMs(x.bas), bitMs: zamanMs(x.bit) }))
    .filter(x => Number.isFinite(x.basMs) && Number.isFinite(x.bitMs) && x.bitMs >= x.basMs);
  return { var: !!(dosya && fs.existsSync(dosya)), dosya: dosya || null, provalar,
    aciklamalar: Array.isArray(p.aciklamalar) ? p.aciklamalar : [], incelemeler: Array.isArray(p.incelemeler) ? p.incelemeler : [],
    surumOlaylari: Array.isArray(p.surumOlaylari) ? p.surumOlaylari : [], onaylar: p.onaylar && typeof p.onaylar === 'object' ? p.onaylar : {},
    // 73.8: Sorun merkezi araçlarının (kayıt eşitleme, zarar sınırı, sapma / yatırma kabulü) SİSTEMİN yazdığı kayıtları — ölçümden düşülecek
    // kullanıcı müdahaleleri. Hükümleri kendiliğinden DEĞİŞTİRMEZ; raporda sayılır, açıklamayı kullanıcı `aciklamalar`a yazar.
    mudahaleler: Array.isArray(p.mudahaleler) ? p.mudahaleler : [] };
}

// ── Saf sınıflandırıcılar (eşik → durum). Selftest her sınırın iki yanını dener. ──
const S = {
  U1(maxU1) {
    if (maxU1 == null) return { durum: H.OLCULEMEDI };
    if (maxU1 <= E.ESIK.U1.gecti) return { durum: H.GECTI };
    return { durum: H.INCELE, not: maxU1 > E.ESIK.U1.incele ? '> %5 — U2 (funding düzeltmeli) belirleyici' : null };
  },
  U2(maxU2, maxU1) {
    if (maxU2 == null) return { durum: H.OLCULEMEDI };
    if (maxU2 > E.ESIK.U2.incele) return { durum: H.GECMEDI };
    if (maxU2 > E.ESIK.U2.gecti) return { durum: H.INCELE };
    if (maxU1 != null && maxU1 > E.ESIK.U1.incele) return { durum: H.INCELE, not: 'U1 > %5 iken U2 ≤ %5 (demo yaklaşımı kaynaklı)' };
    return { durum: H.GECTI };
  },
  U3(n) { if (n == null) return { durum: H.OLCULEMEDI }; return { durum: n === 0 ? H.GECTI : n < E.ESIK.U3.gecmediGun ? H.INCELE : H.GECMEDI }; },
  U4(bp, dolum) {
    if (bp == null || !(dolum >= E.ESIK.U4.asgariDolum)) return { durum: H.OLCULEMEDI, not: `referanslı piyasa emri ${dolum || 0} < ${E.ESIK.U4.asgariDolum}` };
    return { durum: bp <= E.ESIK.U4.gectiBp ? H.GECTI : bp <= E.ESIK.U4.inceleBp ? H.INCELE : H.GECMEDI };
  },
  U5(bp) { if (bp == null) return { durum: H.OLCULEMEDI }; return { durum: bp <= E.ESIK.U5.gectiBp ? H.GECTI : H.INCELE }; },
  U6(aciklanmis, aciklanamayan) {
    if (aciklanmis == null) return { durum: H.OLCULEMEDI };
    return { durum: aciklanamayan >= 1 ? H.GECMEDI : aciklanmis >= 1 ? H.INCELE : H.GECTI };
  },
  _kat(a, b, kat) {
    if (a == null) return { durum: H.OLCULEMEDI, not: 'olay gözlenmedi' };
    if (b == null || !(Math.abs(b) > 1e-9)) return { durum: H.OLCULEMEDI, not: 'karşılaştırma dolumu yok' };
    return { durum: Math.abs(a) <= kat * Math.abs(b) ? H.GECTI : H.INCELE, oran: Math.abs(a) / Math.abs(b) };
  },
  U8a(rejim, diger) { const r = S._kat(rejim, diger, E.ESIK.U8.rejimKat); if (rejim == null) r.not = 'rejim geçişi gözlenmedi → 126 g'; return r; },
  U8b(ayBasi, diger) { return S._kat(ayBasi, diger, E.ESIK.U8.ayBasiKat); },
  I1(x) {
    if (!x) return { durum: H.OLCULEMEDI };
    if (x.aciklanamayan >= 1 || x.bilinmiyor >= 1 || x.ciftEmir >= 1 || x.defterFark >= 1 || x.cozulmeyen >= 1) return { durum: H.GECMEDI };
    if (x.aciklanmis === 1) return { durum: H.INCELE };
    if (x.aciklanmis > 1) return { durum: H.INCELE, not: 'birden çok açıklanmış uyuşmazlık — ön kayıtta tanımsız; yazılı inceleme' };
    return { durum: H.GECTI };
  },
  I2(aciklanmis, aciklanamayan) {
    if (aciklanmis == null) return { durum: H.OLCULEMEDI };
    const t = aciklanmis + aciklanamayan;
    if (t === 0) return { durum: H.GECTI };
    if (aciklanamayan >= 1 || t >= E.ESIK.I2.gecmedi) return { durum: H.GECMEDI };
    return { durum: H.INCELE };
  },
  I3a(n) { if (n == null) return { durum: H.OLCULEMEDI }; return { durum: n === 0 ? H.GECTI : n < E.ESIK.I3a.gecmedi ? H.INCELE : H.GECMEDI }; },
  I3b(n) { if (n == null) return { durum: H.OLCULEMEDI }; return { durum: n <= E.ESIK.I3b.gecti ? H.GECTI : n <= E.ESIK.I3b.incele ? H.INCELE : H.GECMEDI }; },
  I4a(kapsam, maxKorumasizSaat, hepsiSonrakiDenetimde) {
    if (kapsam == null) return { durum: H.OLCULEMEDI };
    if (kapsam < E.ESIK.I4a.incele || maxKorumasizSaat > E.ESIK.I4a.korumasizSaat) return { durum: H.GECMEDI };
    if (kapsam >= E.ESIK.I4a.gecti && hepsiSonrakiDenetimde) return { durum: H.GECTI };
    return { durum: H.INCELE };
  },
  I4b(aciklanmis, aciklanamayan) {
    if (aciklanmis == null) return { durum: H.OLCULEMEDI };
    if (aciklanamayan >= 1) return { durum: H.GECMEDI };
    if (aciklanmis === 1) return { durum: H.INCELE };
    if (aciklanmis > 1) return { durum: H.INCELE, not: 'birden çok açıklanmış kayıp — ön kayıtta tanımsız; yazılı inceleme' };
    return { durum: H.GECTI };
  },
  I4c(tetikler) {
    if (tetikler == null) return { durum: H.OLCULEMEDI };
    if (!tetikler.length) return { durum: H.GECTI, not: 'tetik olmadı (uygulanmaz)' };
    return { durum: tetikler.every(t => t.kapandi && t.mutabakatTemiz) ? H.GECTI : H.GECMEDI };
  },
  I5(maxOran, mesafeAlarm, likidasyonOnce) {
    if (maxOran == null && !mesafeAlarm && !likidasyonOnce) return { durum: H.OLCULEMEDI };
    if ((maxOran != null && maxOran >= E.ESIK.I5.alarm) || likidasyonOnce > 0) return { durum: H.GECMEDI };
    if ((maxOran != null && maxOran >= E.ESIK.I5.uyari) || mesafeAlarm > 0) return { durum: H.INCELE };
    return { durum: H.GECTI };
  },
  I6(kacirilan, temizPencere, telafiDogru) {
    if (kacirilan == null) return { durum: H.OLCULEMEDI };
    if (kacirilan > E.ESIK.I6.incele || telafiDogru === false) return { durum: H.GECMEDI };
    if (kacirilan > E.ESIK.I6.gecti) return { durum: H.INCELE };
    return temizPencere ? { durum: H.GECTI } : { durum: H.INCELE, not: 'kesintisiz 30 g aralık henüz yok' };
  },
  I7(oran) { if (oran == null) return { durum: H.OLCULEMEDI }; return { durum: oran >= E.ESIK.I7.gecti ? H.GECTI : oran >= E.ESIK.I7.incele ? H.INCELE : H.GECMEDI }; },
  I8(n, sonrasiSorun) {
    if (n == null) return { durum: H.OLCULEMEDI };
    if (sonrasiSorun || n >= E.ESIK.I8.gecmedi) return { durum: H.GECMEDI };
    return { durum: n === 0 ? H.GECTI : H.INCELE };
  },
  I9(oran) { if (oran == null) return { durum: H.OLCULEMEDI }; return { durum: oran <= E.ESIK.I9.gecti ? H.GECTI : oran <= E.ESIK.I9.incele ? H.INCELE : H.GECMEDI }; },
  G1(olc, bant) {
    if (!olc || !bant || olc.vol == null) return { durum: H.OLCULEMEDI };
    if (olc.maxdd > bant.maxddP99) return { durum: H.GECMEDI };
    const ici = olc.getiri >= bant.getiriP5 && olc.maxdd <= bant.maxddP95 && olc.vol >= bant.volP5 && olc.vol <= bant.volP95;
    return { durum: ici ? H.GECTI : H.INCELE };
  },
};

/** Genel hüküm (§4 "Genel hüküm (63. gün)"). */
function genelHukum({ olcutler, provalar, g1, ileriA, c, faz2 }) {
  if (!faz2) return { hukum: null, metin: 'ARA RAPOR — hüküm yok (hüküm 63. günde; ara raporlar betimleyicidir)' };
  const birincil = olcutler.filter(o => E.BIRINCIL.includes(o.kod));
  const gecmedi = birincil.filter(o => o.durum === H.GECMEDI).map(o => o.kod);
  const provaGecmedi = provalar.filter(p => p.hukum === 'geçmedi').map(p => `prova ${p.no}`);
  if (gecmedi.length || provaGecmedi.length || (g1 && g1.durum === H.GECMEDI)) {
    return { hukum: H.GECMEDI, metin: `GEÇMEDİ: ${[...gecmedi, ...provaGecmedi, ...(g1 && g1.durum === H.GECMEDI ? ['G1 MaxDD > p99'] : [])].join(', ')} — düzeltmeden sonra yeni 63 günlük pencere` };
  }
  const acik = birincil.filter(o => o.durum === H.INCELE && !o.kapatildi).map(o => o.kod);
  const olculemedi = birincil.filter(o => o.durum === H.OLCULEMEDI).map(o => o.kod);
  const eksikProva = provalar.filter(p => p.zorunlu && p.hukum !== 'geçti').map(p => `prova ${p.no}`);
  const ek = [];
  if (ileriA && ileriA.durum === 'DUR') ek.push('PLAN-ILERI A: DUR');
  for (const [k, v] of Object.entries(c || {})) if (v.saglandi !== true) ek.push(`PLAN-ILERI ${k}`);
  if (acik.length || olculemedi.length || eksikProva.length || ek.length) {
    return { hukum: H.INCELE, metin: `İNCELE: ${[...acik.map(x => `${x} açık inceleme`), ...olculemedi.map(x => `${x} ölçülemedi (→ 126 g)`), ...eksikProva.map(x => `${x} yapılmadı/geçmedi`), ...ek].join(', ')}` };
  }
  return { hukum: H.GECTI, metin: 'GEÇTİ — birincil ölçütler ve provalar geçti (karar kullanıcıda; protokol geçiş önermez)' };
}

const agirlikliOrt = (l, f) => { let a = 0, w = 0; for (const x of l) { const v = f(x); if (Number.isFinite(v) && x.nominal > 0) { a += v * x.nominal; w += x.nominal; } } return w > 0 ? a / w : null; };
/** Gün blokları (bunching) ile ağırlıklı ortalamanın standart hatası: gün ortalamalarının sd / √gün. */
function gunBlokSe(l, f) {
  const g = new Map();
  for (const x of l) { const v = f(x); if (!Number.isFinite(v)) continue; (g.get(x.gun) || g.set(x.gun, []).get(x.gun)).push(x); }
  const m = [...g.values()].map(xs => agirlikliOrt(xs, f)).filter(Number.isFinite);
  if (m.length < 2) return null;
  const o = m.reduce((a, b) => a + b, 0) / m.length;
  return Math.sqrt(m.reduce((a, b) => a + (b - o) ** 2, 0) / (m.length - 1)) / Math.sqrt(m.length);
}

// ── Ana rapor ─────────────────────────────────────────────────────────────
function* raporAdimlari(o = {}) {
  const dizin = o.dizin || yollar.veri('live', 'hucum-demo');
  const D = (ad) => path.join(dizin, ad);
  const hesapDosya = o.hesapDosya || yollar.veri('live', 'hesap-islemleri.jsonl');
  const sunucuAlarm = o.sunucuAlarmDosya || yollar.veri('live', 'alarmlar.jsonl');
  const supDosya = o.supervisorDosya || yollar.veri('supervisor.log');
  const golgeDosya = o.golgeDosya || yollar.veri('ileri', 'bindirme-golge.jsonl');
  const refDosya = o.refDosya || yollar.veri('arastirma', 'demo-kabul-ref.json');
  const strateji = o.strateji || 'hucum';
  const hesapAdi = o.hesap || 'testnet';
  const bugun = o.bit || gunStr(o.simdi || Date.now());
  const prova = provaYukle(o.prova || D('prova-gunlugu.json'));
  let adGorunen = strateji;
  try { adGorunen = require('../research/bindirme').STRATEJILER[strateji].ad; } catch { /* */ }
  const adEski = require('../botAdlari').eski(strateji);   // 72.0: 'Hücum: …' başlıklı eski sunucu alarmları da bu botundur

  // Özsermaye: gün başına SON satır (bindirmeBot.ozsermayeOku ile aynı)
  const ozHam = jsonlOku(D('ozsermaye.jsonl')) || [];
  const gunluk = new Map();
  for (const k of ozHam) { const g = k.gun || (k.zaman ? gunStr(zamanMs(k.zaman)) : null); if (g && g >= E.GUN0_TABAN) gunluk.set(g, { ...k, gun: g }); }
  const ozTum = [...gunluk.values()].sort((a, b) => (a.gun < b.gun ? -1 : 1));
  const gun0 = o.gun0 || (ozTum.length ? ozTum[0].gun : null);
  if (!gun0) {
    return { plan: E.PLAN, strateji, dizin, bugun, gun0: null, veriVar: false, hukum: null,
      metin: `Gün 0 henüz yok — ${path.relative(KOK, D('ozsermaye.jsonl'))} içinde ${E.GUN0_TABAN} ve sonrası kayıt yok (bu makinede bot çalışmaz; rapor sunucudaki veriyle anlamlı).`, olcutler: [] };
  }
  const bitGun = bugun;
  const gecenGun = Math.max(0, Math.round((gunMs(bitGun) - gunMs(gun0)) / GUN));
  const faz2 = gecenGun >= E.ASAMALAR.hukum;
  const pencereBit = faz2 ? gunEkle(gun0, E.ASAMALAR.hukum) : bitGun;   // hüküm penceresi: 63 g
  const pBas = gunMs(gun0), pBit = gunMs(pencereBit) + GUN;               // [Gün 0 00:00, pencereBit 24:00)
  const icinde = (t) => Number.isFinite(t) && t >= pBas && t < pBit;
  const provaIcinde = (t) => prova.provalar.some(p => t >= p.basMs && t <= p.bitMs);
  const provaGunu = (g) => prova.provalar.some(p => p.bitMs >= gunMs(g) && p.basMs < gunMs(g) + GUN);
  const olcumde = (t) => icinde(t) && !provaIcinde(t);
  const aciklama = (olcut, t, metin = '') => prova.aciklamalar.find(a => a && a.olcut && (olcut === a.olcut || olcut.startsWith(a.olcut))
    && (a.gun ? a.gun === gunStr(t) : (a.bas && a.bit ? t >= zamanMs(a.bas) && t <= zamanMs(a.bit) : false))
    && (!a.icerir || String(metin).includes(a.icerir))) || null;

  const bot = jsonOku(D('bindirme-bot.json')) || {};
  const kalkan = jsonOku(D('kalkan-bot.json')) || {};
  const korumaJson = jsonOku(D('koruma.json')) || {};
  const kalp = jsonOku(D('kalp.json')) || {};
  const riskDurum = jsonOku(D('risk-durum.json'));
  const emirler = defterOku(D('emirler.jsonl'));
  const borsaIdden = new Map([...emirler.values()].filter(e => e.borsaId).map(e => [String(e.borsaId), e]));
  const hTum = (jsonlOku(hesapDosya) || []).filter(k => !k.hesap || k.hesap === hesapAdi);
  const alarmD = jsonlOku(D('alarmlar.jsonl'));
  const marjL = jsonlOku(D('marj.jsonl'));
  const mutL = jsonlOku(D('mutabakat.jsonl'));
  const golgeL = jsonlOku(D('golge-farklar.jsonl'));
  const sapmaL = jsonlOku(D('sapma.jsonl'));
  const korumaL = jsonlOku(D('koruma.jsonl'));
  const sunucuL = jsonlOku(sunucuAlarm);
  const sup = supervisorOku(supDosya);

  // §8.2 kayıt başlangıcı: mutabakat.jsonl'in ilk satırı (her günlük çalışmada yazılır)
  const kayitBas = mutL && mutL.length ? Math.min(...mutL.map(x => x.zaman).filter(Number.isFinite)) : null;
  const kapsam = (bas) => {
    if (!Number.isFinite(bas)) return { ilk: null, gun: 0, tam: false };
    const b = Math.max(bas, pBas), son = Math.min(pBit, gunMs(bitGun) + GUN);
    return { ilk: new Date(bas).toISOString(), gun: Math.max(0, Math.round((son - gunMs(gunStr(b))) / GUN)), tam: bas <= pBas + GUN };
  };
  const yeniKayitKapsam = kapsam(kayitBas);

  const olcutler = [];
  const ekle = (kod, ad, deger, sinif, kaynak, ek = {}) => {
    const inc = prova.incelemeler.find(x => x && x.olcut === kod);
    const not = [sinif.not, ek.not].filter(Boolean).join(' · ') || null;
    olcutler.push({ kod, ad, deger, durum: sinif.durum, kaynak, kapatildi: !!(inc && inc.kapatildi), ...ek, not, ...(sinif.oran != null ? { oran: sinif.oran } : {}) });
  };

  // ── U1 / U2: 30 g birikimli |gerçekleşen − gölge| ────────────────────────
  const farkMap = new Map();
  for (const f of [...(bot.golgeFarklar || []), ...(golgeL || [])]) if (f && f.bas && f.bit && Number.isFinite(+f.fark)) farkMap.set(`${f.bas}|${f.bit}`, f);
  const farklar = [...farkMap.values()].filter(f => f.bit > gun0 && f.bit <= pencereBit)
    .filter(f => { for (let g = gunEkle(f.bas, 1); g <= f.bit; g = gunEkle(g, 1)) if (provaGunu(g)) return false; return true; })
    .sort((a, b) => (a.bit < b.bit ? -1 : 1));
  let maxU1 = null, maxU2 = null, okunamadi = 0;
  for (const f of farklar) {
    const oz = I.uygulamaOzeti(farklar.filter(x => x.bit <= f.bit), f.bit);
    const u2 = oz.birikimMutlak, u1 = Math.abs('birikimHam' in oz ? oz.birikimHam : oz.birikim);
    maxU1 = maxU1 == null ? u1 : Math.max(maxU1, u1);
    maxU2 = maxU2 == null ? u2 : Math.max(maxU2, u2);
  }
  okunamadi = farklar.filter(f => f.fundingDuzeltme === 'okunamadı').length;
  ekle('U1', 'uygulama sapması (30 g, ham)', maxU1, S.U1(maxU1), 'golge-farklar.jsonl + bindirme-bot.json golgeFarklar', { aralik: farklar.length });
  ekle('U2', 'düzeltilmiş sapma (BTC funding çıkarılmış)', maxU2, S.U2(maxU2, maxU1), 'golgeFarklar[].fark (bot U2 ile hesaplar)', { fundingOkunamadi: okunamadi, not: okunamadi ? `${okunamadi} aralıkta funding okunamadı — o aralıklar ham` : null });

  // ── U3: günlük model sapması ───────────────────────────────────────────
  const sapMap = new Map();
  for (const s of [...(bot.sapmaGecmisi || []), ...(sapmaL || [])]) if (s && s.gun && Number.isFinite(+s.fark)) sapMap.set(s.gun, s);
  const sapmalar = [...sapMap.values()].filter(s => s.gun >= gun0 && s.gun <= pencereBit && !provaGunu(s.gun));
  const buyuk = sapmalar.filter(s => Math.abs(s.fark) > E.ESIK.U3.gunFarkPuan);
  const buyukAciklanamayan = buyuk.filter(s => !aciklama('U3', gunMs(s.gun)));
  ekle('U3', 'günlük model sapması > 2 puan (açıklanamayan gün)', sapmalar.length ? buyukAciklanamayan.length : null, S.U3(sapmalar.length ? buyukAciklanamayan.length : null), 'sapma.jsonl + sapmaGecmisi',
    { gunSayisi: sapmalar.length, buyukGun: buyuk.map(s => ({ gun: s.gun, fark: s.fark })) });

  // ── Dolumlar (H) ↔ emirler ────────────────────────────────────────────
  const dolumlar = [];
  const yabanciDolum = [];
  for (const k of hTum) {
    if (k.tur !== 'islem') continue;
    const e = (k.emirNo && borsaIdden.get(String(k.emirNo))) || (k.clientOrderId && emirler.get(k.clientOrderId)) || null;
    const nominal = Math.abs(+k.miktar || 0) * (+k.fiyat || 0);
    const x = { zaman: k.zaman, gun: gunStr(k.zaman), symbol: k.symbol, side: k.side, miktar: +k.miktar, fiyat: +k.fiyat, nominal,
      ucretBp: k.ucretBirim === 'USDT' && nominal > 0 && Number.isFinite(+k.ucret) ? +k.ucret / nominal * 1e4 : null, emirNo: k.emirNo,
      bot: e ? e.bot : null, tip: e ? e.type : null, neden: e ? e.neden : null, olusturma: e ? e.olusturma : null, refMark: e ? sayi(e.refMark) : null, limit: e ? sayi(e.price) : null };
    if (!e) { if (icinde(k.zaman)) yabanciDolum.push(x); continue; }
    dolumlar.push(x);
  }
  const olcDolum = dolumlar.filter(x => olcumde(x.zaman) && x.bot !== 'ad' && x.bot !== 'acil');
  const piyasa = olcDolum.filter(x => x.tip === 'market');
  const limitD = olcDolum.filter(x => x.tip === 'limit');
  const refIstek = [...new Set(piyasa.map(x => `${x.symbol}|${gunStr(x.olusturma || x.zaman)}`))];
  // Prod günlük mum referansı: sürücü verir (lib: yalnız yerel önbellek; CLI --ag: ağdan tamamlar)
  const { ref, hata: refHata } = yield { istek: refIstek, refDosya };
  const yon = (x) => (x.side === 'buy' ? 1 : -1);
  for (const x of piyasa) {
    const r = ref[`${x.symbol}|${gunStr(x.olusturma || x.zaman)}`];
    x.kaymaA = r > 0 ? yon(x) * (x.fiyat - r) / r * 1e4 : null;
    x.kaymaB = x.refMark > 0 ? yon(x) * (x.fiyat - x.refMark) / x.refMark * 1e4 : null;
    x.maliyet = x.kaymaA != null && x.ucretBp != null ? x.kaymaA + x.ucretBp : null;
  }
  for (const x of limitD) x.kaymaLimit = x.limit > 0 ? yon(x) * (x.fiyat - x.limit) / x.limit * 1e4 : null;
  const piyasaRefli = piyasa.filter(x => x.maliyet != null);
  const emirSay = (l) => new Set(l.map(x => x.emirNo)).size;
  const u4 = piyasaRefli.length ? agirlikliOrt(piyasaRefli, x => x.maliyet) : null;
  ekle('U4', 'toplam maliyet = kayma(a) + ücret, bp (piyasa dolumu)', u4, S.U4(u4, emirSay(piyasaRefli)), 'H dolumları ↔ emirler.jsonl borsaId; referans prod 1d açılışı',
    { piyasaEmir: emirSay(piyasa), refliEmir: emirSay(piyasaRefli), kaymaA: agirlikliOrt(piyasaRefli, x => x.kaymaA), kaymaASe: gunBlokSe(piyasaRefli, x => x.kaymaA),
      kaymaB: agirlikliOrt(piyasa.filter(x => x.kaymaB != null), x => x.kaymaB), kaymaBEmir: emirSay(piyasa.filter(x => x.kaymaB != null)),
      limitKayma: agirlikliOrt(limitD.filter(x => x.kaymaLimit != null), x => x.kaymaLimit), limitEmir: emirSay(limitD),
      not: !o.ag && refIstek.some(k => ref[k] == null) ? 'referans mum önbellekte yok — --ag ile prod günlük mumları çekin' : (refHata ? `referans okunamadı: ${refHata}` : null) });
  const u5 = agirlikliOrt(olcDolum.filter(x => x.ucretBp != null), x => x.ucretBp);
  ekle('U5', 'ücret / nominal, bp', u5, S.U5(u5), 'H ucret, ucretBirim', { dolum: olcDolum.length });

  // ── U6: yabancı funding (botun pozisyonu olmayan sembolde) ──────────────
  const fundingL = hTum.filter(k => k.tur === 'funding' && olcumde(k.zaman));
  const tumBizim = dolumlar.slice().sort((a, b) => a.zaman - b.zaman);
  const pozisyonAn = (s, t) => tumBizim.filter(x => x.symbol === s && x.zaman < t).reduce((a, x) => a + (x.side === 'buy' ? 1 : -1) * x.miktar, 0);
  const yabanciF = fundingL.filter(f => f.symbol && Math.abs(pozisyonAn(f.symbol, f.zaman)) < 1e-9);
  const yfAciklanmis = yabanciF.filter(f => aciklama('U6', f.zaman, f.symbol)).length;
  ekle('U6', 'yabancı funding satırı', hTum.length ? yabanciF.length : null, S.U6(hTum.length ? yfAciklanmis : null, yabanciF.length - yfAciklanmis), 'H tur:funding ↔ dolumlardan pozisyon',
    { aciklanmis: yfAciklanmis, semboller: [...new Set(yabanciF.map(f => f.symbol))] });

  // ── U7 (betimleyici, eşik yok): demo BTC ayağı funding ─────────────────
  const btF = farklar.reduce((a, f) => a + (Number.isFinite(+f.btFunding) ? +f.btFunding : 0), 0);
  const btcF = fundingL.filter(f => /^BTC\//.test(f.symbol || '')).reduce((a, f) => a + (+f.tutar || 0), 0);

  // ── U8: takvim akış maliyeti ──────────────────────────────────────────
  const rejimD = piyasaRefli.filter(x => x.bot === 'bt' && /rejim (girişi|çıkışı)/.test(x.neden || ''));
  const digerD = piyasaRefli.filter(x => !rejimD.includes(x));
  ekle('U8a', 'rejim geçişi BTC dolumu kayması ↔ diğerleri (kat)', rejimD.length ? agirlikliOrt(rejimD, x => x.kaymaA) : null,
    S.U8a(rejimD.length ? agirlikliOrt(rejimD, x => x.kaymaA) : null, digerD.length ? agirlikliOrt(digerD, x => x.kaymaA) : null), 'emirler neden + kayma(a)',
    { diger: digerD.length ? agirlikliOrt(digerD, x => x.kaymaA) : null, rejimEmir: emirSay(rejimD) });
  const ayBasi = (x) => gunStr(x.olusturma || x.zaman).endsWith('-01');
  const abD = piyasaRefli.filter(ayBasi), abDiger = piyasaRefli.filter(x => !ayBasi(x));
  ekle('U8b', 'ay başı günleri birim maliyeti ↔ diğer günler (kat)', abD.length ? agirlikliOrt(abD, x => x.maliyet) : null,
    S.U8b(abD.length ? agirlikliOrt(abD, x => x.maliyet) : null, abDiger.length ? agirlikliOrt(abDiger, x => x.maliyet) : null), 'emirler olusturma (UTC ayın 1\'i) + U4',
    { diger: abDiger.length ? agirlikliOrt(abDiger, x => x.maliyet) : null, ayBasiEmir: emirSay(abD) });
  const calismaDk = [...emirler.values()].filter(e => olcumde(e.olusturma) && ['bt', 'kn', 'kd'].includes(e.bot)).map(e => (e.olusturma % GUN) / 60000).sort((a, b) => a - b);

  // ── I1: mutabakat temizliği ───────────────────────────────────────────
  let i1 = null;
  if (mutL) {
    const ml = mutL.filter(m => olcumde(m.zaman) && m.kaynak !== 'acil-deneme' && !m.ertelendi);
    const uyus = ml.filter(m => !m.temiz);
    let aciklanmis = 0, aciklanamayan = 0;
    for (const m of uyus) {
      const coz = ml.find(x => x.zaman > m.zaman && x.temiz && gunStr(x.zaman) === gunStr(m.zaman));
      if (aciklama('I1', m.zaman, m.engel) && coz) aciklanmis++; else aciklanamayan++;
    }
    const bilinmiyor = [...emirler.values()].filter(e => e.durum === 'BILINMIYOR').length;
    // Defter ↔ borsa: DOLDU emrin defter miktarı ↔ H dolum toplamı (emirNo = borsaId)
    const hMiktar = new Map();
    for (const x of dolumlar) hMiktar.set(String(x.emirNo), (hMiktar.get(String(x.emirNo)) || 0) + x.miktar);
    const defterFark = [...emirler.values()].filter(e => e.borsaId && olcumde(e.olusturma) && +e.dolan > 0 && hMiktar.has(String(e.borsaId))
      && Math.abs(hMiktar.get(String(e.borsaId)) - +e.dolan) > Math.max(1e-9, +e.dolan * 1e-6));
    // Çift emir: aynı gün + sembol + bot (BTC ayağı / Donchian) + yön, birden çok DOLDU emir grubu (dilim grubu tek sayılır)
    const grup = new Map();
    for (const e of emirler.values()) {
      if (!['bt', 'kn'].includes(e.bot) || !(+e.dolan > 0) || !olcumde(e.olusturma)) continue;
      const k = `${gunStr(e.olusturma)}|${e.symbol}|${e.bot}|${e.side}`;
      (grup.get(k) || grup.set(k, new Set()).get(k)).add(e.dilimGrup || e.id);
    }
    const cift = [...grup.entries()].filter(([, s]) => s.size > 1).map(([k]) => k);
    i1 = { uyusmazlik: uyus.length, aciklanmis, aciklanamayan, bilinmiyor, cozulmeyen: 0, defterFark: defterFark.length, ciftEmir: cift.length, temizGun: new Set(ml.filter(m => m.temiz).map(m => gunStr(m.zaman))).size, ciftEmirAnahtar: cift };
  }
  ekle('I1', 'mutabakat temizliği', i1 ? `${i1.uyusmazlik} uyuşmazlık · ${i1.bilinmiyor} BİLİNMİYOR · ${i1.defterFark} defter↔borsa · ${i1.ciftEmir} çift emir` : null, S.I1(i1),
    'mutabakat.jsonl + emirler.jsonl + H', { ayrinti: i1, kapsam: yeniKayitKapsam });

  // ── I2: ENGEL olayları (prova dışı) ────────────────────────────────────
  let i2 = null;
  if (alarmD || kayitBas) {
    const ol = (alarmD || []).filter(a => a.olay && a.olay !== 'bildirim').sort((a, b) => a.zaman - b.zaman);
    let acikVar = false; const engeller = [];
    for (const a of ol) {
      if (a.olay === 'engel') { if (!acikVar && olcumde(a.zaman)) engeller.push(a); acikVar = true; } else if (a.olay === 'engel-kalkti' || a.olay === 'engel-kaldir') acikVar = false;
    }
    const ac = engeller.filter(a => aciklama('I2', a.zaman, a.metin)).length;
    i2 = { toplam: engeller.length, aciklanmis: ac, aciklanamayan: engeller.length - ac, olaylar: engeller.map(a => ({ zaman: new Date(a.zaman).toISOString(), kaynak: a.kaynak, metin: a.metin })) };
  }
  ekle('I2', 'ENGEL (prova dışı)', i2 ? i2.toplam : null, S.I2(i2 ? i2.aciklanmis : null, i2 ? i2.aciklanamayan : 0), 'alarmlar.jsonl olay:engel', { ayrinti: i2, kapsam: yeniKayitKapsam,
    not: bot.engel || kalkan.engel ? `şu an ENGEL var: ${bot.engel || kalkan.engel}` : null });

  // ── I3: alarm sayısı (Bildirici 6 saatlik kısıtı taklit edilir — Telegram kapalıyken satırlar kısıtsızdır) ──
  let i3 = null;
  if (alarmD || kayitBas) {
    const bildirim = [
      ...(alarmD || []).filter(a => a.olay === 'bildirim').map(a => ({ ...a, kaynakDosya: 'bot' })),
      ...(sunucuL || []).filter(a => typeof a.baslik === 'string' && (a.baslik.startsWith(`${adGorunen}: `) || (adEski && a.baslik.startsWith(`${adEski}: `)))).map(a => ({ ...a, kaynakDosya: 'sunucu' })),
    ].filter(a => (a.tur === 'alarm' || a.tur === 'uyari') && olcumde(a.zaman)).sort((a, b) => a.zaman - b.zaman);
    const son = new Map(); const sayilan = [];
    for (const a of bildirim) {
      const k = a.anahtar || `${a.tur}:${a.baslik}`;
      if (son.has(k) && a.zaman - son.get(k) < 6 * SAAT) continue;
      son.set(k, a.zaman); sayilan.push(a);
    }
    const alarmlar = sayilan.filter(a => a.tur === 'alarm');
    const hataTur = (a) => /çalışmada hata|günlük çalışma yapılamadı/.test(a.baslik);
    const aciklandi = (a) => !!aciklama('I3', a.zaman, `${a.baslik} ${a.satir || ''}`);
    const turler = {};
    for (const a of sayilan) { const t = String(a.baslik).replace(/^[^:]*\):\s*|^[^:]*:\s*/, '').slice(0, 60); turler[t] = (turler[t] || 0) + 1; }
    i3 = { a: alarmlar.filter(a => hataTur(a) && !aciklandi(a)).length, b: alarmlar.filter(aciklandi).length, toplamAlarm: alarmlar.length, toplamUyari: sayilan.length - alarmlar.length, turler,
      // 67.5: panel "Ayrıntı" için sayılan her bildirim (tür, zaman, başlık, kaynak)
      liste: sayilan.map(a => ({ zaman: new Date(a.zaman).toISOString(), tur: a.tur, baslik: String(a.baslik || '').slice(0, 120), kaynak: a.kaynakDosya, hata: hataTur(a), aciklanmis: aciklandi(a) })) };
  }
  ekle('I3a', 'açıklanamayan hata alarmı ("çalışmada hata", "günlük çalışma yapılamadı")', i3 ? i3.a : null, S.I3a(i3 ? i3.a : null), 'alarmlar.jsonl (bot) + data/live/alarmlar.jsonl (sunucu)', { ayrinti: i3, kapsam: yeniKayitKapsam,
    not: 'aynı kök neden düzeltmeden sonra tekrar → GEÇMEDİ kuralı otomatik denetlenmez (prova günlüğü incelemeler)' });
  ekle('I3b', 'açıklanmış alarm (prova günlüğü aciklamalar)', i3 ? i3.b : null, S.I3b(i3 ? i3.b : null), 'alarmlar.jsonl', { kapsam: yeniKayitKapsam });

  // ── I4: felaket stopu ─────────────────────────────────────────────────
  let i4a = null, i4b = null, i4c = null;
  if (korumaL) {
    const kl = korumaL.filter(k => icinde(k.zaman) && !k.atlandi).sort((a, b) => a.zaman - b.zaman);
    const gun = kl.filter(k => k.tur === 'guncelle' && !provaIcinde(k.zaman));
    let korunan = 0, toplam = 0, maxSaat = 0, hepsi = true;
    for (const g of gun) {
      const hataS = [...new Set((g.hatalar || []).filter(h => h.symbol && !/^iptal:/.test(h.hata)).map(h => h.symbol))];
      korunan += (g.konan || []).length + (g.korunan || []).length; toplam += (g.konan || []).length + (g.korunan || []).length + hataS.length;
      for (const s of hataS) {
        const sonraki = kl.find(x => x.zaman > g.zaman && ((x.konan || []).includes(s) || (x.korunan || []).includes(s)));
        const ilkDenetim = kl.find(x => x.zaman > g.zaman && x.tur === 'denetim');
        if (!sonraki || sonraki !== ilkDenetim) hepsi = false;
        maxSaat = Math.max(maxSaat, ((sonraki ? sonraki.zaman : Math.min(pBit, Date.now())) - g.zaman) / SAAT);
      }
    }
    // Kaybolan stoplar (kayıp anından yeniden konana kadar korumasız)
    const kayip = [];
    for (const k of kl) for (const x of k.kaybolan || []) kayip.push({ ...x, zaman: k.zaman });
    for (const x of kayip.filter(x => !x.tetiklendi)) {
      const sonraki = kl.find(k => k.zaman >= x.zaman && ((k.konan || []).includes(x.symbol) || (k.korunan || []).includes(x.symbol)));
      if (!provaIcinde(x.zaman)) maxSaat = Math.max(maxSaat, ((sonraki ? sonraki.zaman : Math.min(pBit, Date.now())) - x.zaman) / SAAT);
    }
    i4a = { kapsam: toplam ? korunan / toplam : null, pozisyonGun: toplam, korunan, maxKorumasizSaat: maxSaat, hepsiSonrakiDenetimde: hepsi, guncelleme: gun.length };
    const kayb = kayip.filter(x => !x.tetiklendi && !provaIcinde(x.zaman));
    const ac = kayb.filter(x => aciklama('I4', x.zaman, x.symbol)).length;
    i4b = { kayboldu: kayb.length, aciklanmis: ac, aciklanamayan: kayb.length - ac };
    i4c = kayip.filter(x => x.tetiklendi && !provaIcinde(x.zaman)).map(x => {
      const m = (mutL || []).find(m => m.zaman > x.zaman && m.kaynak === 'gunluk');
      return { symbol: x.symbol, zaman: new Date(x.zaman).toISOString(), kapandi: !x.pozisyonKaldi, mutabakatTemiz: !!(m && m.temiz) };
    });
  }
  ekle('I4a', 'felaket stopu kapsamı (pozisyon-gün, BTC ayağı hariç)', i4a ? i4a.kapsam : null, S.I4a(i4a ? i4a.kapsam : null, i4a ? i4a.maxKorumasizSaat : 0, i4a ? i4a.hepsiSonrakiDenetimde : false), 'koruma.jsonl', { ayrinti: i4a, kapsam: kapsam(korumaL && korumaL.length ? korumaL[0].zaman : null) });
  ekle('I4b', 'stop kayboldu (tetiklenmeden)', i4b ? i4b.kayboldu : null, S.I4b(i4b ? i4b.aciklanmis : null, i4b ? i4b.aciklanamayan : 0), 'koruma.jsonl kaybolan', { ayrinti: i4b });
  ekle('I4c', 'stop tetiklendiyse: pozisyon kapandı + mutabakat temiz', i4c ? i4c.length : null, S.I4c(i4c), 'koruma.jsonl + mutabakat.jsonl', { ayrinti: i4c });

  // ── I5: marj oranı maksimumu ──────────────────────────────────────────
  let i5 = null;
  if (marjL) {
    const ml = marjL.filter(m => olcumde(m.zaman) && !m.hata);
    const oranlar = ml.map(m => sayi(m.oran)).filter(x => x != null);
    i5 = { olcum: ml.length, okunamadi: marjL.filter(m => olcumde(m.zaman) && m.hata).length, maxOran: oranlar.length ? Math.max(...oranlar) : null,
      enYakinMesafe: ml.map(m => m.enYakin && sayi(m.enYakin.mesafe)).filter(x => x != null).reduce((a, b) => Math.min(a, b), Infinity),
      mesafeAlarm: ml.filter(m => m.seviye === 'alarm' && (m.uyarilar || []).some(u => /likidasyona/.test(u))).length,
      likidasyonOnce: ml.filter(m => (m.likidasyonOnce || []).length).length };
    if (!Number.isFinite(i5.enYakinMesafe)) i5.enYakinMesafe = null;
  }
  ekle('I5', 'marj oranı maksimumu', i5 ? i5.maxOran : null, S.I5(i5 ? i5.maxOran : null, i5 ? i5.mesafeAlarm : 0, i5 ? i5.likidasyonOnce : 0), 'marj.jsonl', { ayrinti: i5, kapsam: kapsam(marjL && marjL.length ? marjL[0].zaman : null),
    not: 'demo marj oranı gerçek hesabınkini temsil etmez (§6.1)' });

  // ── I6: kaçırılan gün ─────────────────────────────────────────────────
  const oz = ozTum.filter(k => k.gun >= gun0 && k.gun <= pencereBit);
  const sonBeklenen = oz.length ? oz[oz.length - 1].gun : gun0;
  const varGun = new Set(oz.map(k => k.gun));
  const eksik = [];
  for (let g = gun0; g <= sonBeklenen; g = gunEkle(g, 1)) if (!varGun.has(g) && !provaGunu(g) && !provaGunu(gunEkle(g, 1))) eksik.push(g);
  let enUzunTemiz = 0, seri = 0;
  for (let g = gun0; g <= sonBeklenen; g = gunEkle(g, 1)) { if (varGun.has(g)) { seri++; enUzunTemiz = Math.max(enUzunTemiz, seri); } else seri = 0; }
  const telafiler = (bot.telafiGecmisi || []).filter(t => olcumde(t.zaman));
  const telafiCift = telafiler.some(t => i1 && i1.ciftEmirAnahtar.some(k => k.startsWith(gunStr(t.zaman))));
  ekle('I6', 'kaçırılan gün', oz.length ? eksik.length : null, S.I6(oz.length ? eksik.length : null, enUzunTemiz >= E.ESIK.I6.temizPencereGun, telafiCift ? false : true), 'ozsermaye.jsonl gün boşlukları + telafiGecmisi',
    { eksikGun: eksik, enUzunKesintisiz: enUzunTemiz, telafi: telafiler.length, not: 'telafi doğruluğu: telafi günlerinde çift emir yok (geçmiş gün emri bot tasarımı gereği verilmez)' });

  // ── I7: çalışma anı ──────────────────────────────────────────────────
  const ilkCalisma = new Map();
  for (const k of ozHam) { const t = zamanMs(k.zaman); if (!olcumde(t)) continue; const g = gunStr(t); if (!ilkCalisma.has(g) || t < ilkCalisma.get(g)) ilkCalisma.set(g, t); }
  const dk = [...ilkCalisma.values()].map(t => (t % GUN) / 60000);
  const zamaninda = dk.filter(d => d >= E.ESIK.I7.basDk && d <= E.ESIK.I7.bitDk).length;
  ekle('I7', 'çalışma anı 00:02–00:30 UTC (gün oranı)', dk.length ? zamaninda / dk.length : null, S.I7(dk.length ? zamaninda / dk.length : null), 'ozsermaye.jsonl zaman (çalışma başlangıcı) · kalp.basla',
    { gun: dk.length, zamaninda, medyanDk: dk.length ? dk.slice().sort((a, b) => a - b)[Math.floor(dk.length / 2)] : null });

  // ── I8: prova dışı çökme ─────────────────────────────────────────────
  let i8 = null;
  if (sup) {
    // 67.5: olaylara ayır (supervisorOlaylari) — 1 dk içindeki ardışık sonlanmalar TEK olay; -1073741205 (node hiç açılamadı)
    // sayılmaz; 1073807364 + ardından "Denetleyici baslatildi" = sistem kapanışı / yeniden başlatma (çökme değil, ayrı bilgi).
    const olaylar = supervisorOlaylari(sup).filter(x => olcumde(x.zaman));
    const cokme = olaylar.filter(x => x.sinif === 'cokme' && !aciklama('I8', x.zaman, String(x.kod)));
    const sonrasiSorun = cokme.some(c => i1 && i1.ciftEmirAnahtar.some(k => k.startsWith(gunStr(c.zaman))));
    const yenidenBasladi = cokme.every(c => sup.some(s => s.zaman >= c.zaman && /Node sureci baslatiliyor/.test(s.metin)));
    const say = (sn) => olaylar.filter(x => x.sinif === sn).length;
    i8 = { cokme: cokme.length, sistemKapanisi: say('sistem-kapanisi'), sayilmayan: say('sayilmayan'), sonrasiSorun: sonrasiSorun || !yenidenBasladi,
      kodlar: cokme.map(c => ({ zaman: new Date(c.zaman).toISOString(), kod: c.kod })),
      olaylar: olaylar.map(x => ({ zaman: new Date(x.zaman).toISOString(), kod: x.kod, kodlar: x.kodlar, satir: x.satir, sinif: x.sinif,
        aciklanmis: x.sinif === 'cokme' && !cokme.includes(x) })) };
  }
  ekle('I8', 'prova dışı çökme', i8 ? i8.cokme : null, S.I8(i8 ? i8.cokme : null, i8 ? i8.sonrasiSorun : false), 'data/supervisor.log (çıkış kodu ≠ 0 / 75; 1 dk içi tek olay; sistem kapanışı ve açılamayan node hariç)',
    { ayrinti: i8, not: i8 && (i8.sistemKapanisi || i8.sayilmayan) ? `ayrıca ${i8.sistemKapanisi} sistem kapanışı / yeniden başlatma${i8.sayilmayan ? ` · ${i8.sayilmayan} sayılmayan (node açılamadı)` : ''} — çökme sayılmaz` : null });

  // ── I9: asgari nominal altı emir oranı ───────────────────────────────
  // 67.5: payda payın kayıtlı olduğu günlerle sınırlı (asgariNominalAlti 2026-10-15'ten sonra yazılıyor; eskiden payda Gün 0'dan beri
  // verilen tüm emirleri sayıyordu → oran olduğundan küçük). Gün = çalışmanın UTC günü (satır zamanı; yoksa karar günü).
  const asgariSatir = oz.filter(k => Number.isFinite(+k.asgariNominalAlti));
  const asgariVar = asgariSatir.length > 0;
  const asgariGun = new Set(asgariSatir.map(k => (Number.isFinite(zamanMs(k.zaman)) ? gunStr(zamanMs(k.zaman)) : k.gun)));
  const verilmeyen = asgariVar ? asgariSatir.reduce((a, k) => a + +k.asgariNominalAlti, 0) : null;
  const verilen = [...emirler.values()].filter(e => ['kn', 'kd'].includes(e.bot) && e.borsaId && olcumde(e.olusturma) && asgariGun.has(gunStr(e.olusturma))).length;
  const i9 = verilmeyen != null && verilmeyen + verilen > 0 ? verilmeyen / (verilmeyen + verilen) : (verilmeyen === 0 ? 0 : null);
  ekle('I9', 'asgari nominal altı (verilmeyen) emir oranı', i9, S.I9(i9), 'ozsermaye.jsonl asgariNominalAlti + emirler.jsonl (kol, borsaId)',
    { verilmeyen, verilen, kayitliGun: asgariSatir.length, bilgiNotu: I9_BILGI,
      not: asgariVar ? I9_BILGI : `ozsermaye satırlarında asgariNominalAlti yok (2026-10-15 öncesi); bot toplamı ${bot.asgariNominal ? bot.asgariNominal.toplam : '—'} (Gün 0 öncesini de içerir) · ${I9_BILGI}` });

  // ── G1 (ikincil): getiri / MaxDD / vol bantları ──────────────────────
  const bantlar = E.BANT[strateji] || E.BANT.hucum;
  const g1Satir = [];
  for (const u of [63, 126, 252]) {
    const tamam = gecenGun >= u;
    const kay = ozTum.filter(k => k.gun >= gun0 && k.gun <= (tamam ? gunEkle(gun0, u) : bitGun));
    const ol = olculer(kay, bot.sermayeAkislari);   // 67.5: bot değeri (tavanlı min(E, tavan) değil)
    g1Satir.push({ ufuk: u, tamam, olcu: ol, bant: bantlar[u], ...S.G1(ol, bantlar[u]) });
  }
  const g1 = g1Satir.find(x => x.ufuk === 63);
  const g1Ara = g1Satir.find(x => !x.tamam) || g1Satir[g1Satir.length - 1];

  // ── PLAN-ILERI A ve C 1–4 ────────────────────────────────────────────
  let ileriA = null;
  try { ileriA = I.golgeModelDurumu(I.golgeOku(golgeDosya), strateji, pencereBit); } catch { ileriA = null; }
  const sonOz = farklar.length ? I.uygulamaOzeti(farklar, farklar[farklar.length - 1].bit) : null;
  const acilDeneme = (alarmD || []).filter(a => a.olay === 'acil-deneme').length || (bot.sonAcilDeneme ? 1 : 0);
  const elleMutabakat = (mutL || []).filter(m => m.kaynak === 'elle' || m.kaynak === 'acil-deneme').length;
  const C = {
    C1: { metin: '≥ 30 g kesintisiz, B Normal, çözülmemiş ENGEL yok', saglandi: enUzunTemiz >= 30 && !!sonOz && sonOz.bant === 'normal' && !bot.engel && !kalkan.engel },
    C2: { metin: 'acil durdurma ve mutabakat denendi', saglandi: acilDeneme > 0 && elleMutabakat > 0, acilDeneme, elleMutabakat },
    C3: { metin: 'PLAN-SERMAYE-1000 kriterleri (belge — prova günlüğü onaylar.C3)', saglandi: prova.onaylar.C3 === true },
    C4: { metin: 'A\'da DUR yok', saglandi: !!ileriA && ileriA.durum !== 'DUR' },
  };

  // ── Provalar ─────────────────────────────────────────────────────────
  const provalar = E.PROVALAR.map(p => {
    const k = prova.provalar.filter(x => +x.no === p.no);
    const son = k[k.length - 1];
    return { ...p, yapildi: k.length > 0, hukum: son ? (son.hukum || null) : null, kayit: k.map(x => ({ bas: x.bas, bit: x.bit, hukum: x.hukum || null, gozlenen: x.gozlenen || null })) };
  });

  const hukum = genelHukum({ olcutler, provalar, g1, ileriA, c: C, faz2 });
  return {
    plan: E.PLAN, olusturma: new Date().toISOString(), strateji, adGorunen, dizin: path.relative(KOK, dizin) || dizin, veriVar: true,
    gun0, bugun: bitGun, gecenGun, pencere: { bas: gun0, bit: pencereBit }, faz: faz2 ? 'Faz 2 — hüküm (63 g)' : gecenGun >= E.ASAMALAR.ara ? 'Faz 1 — ara rapor (30 g)' : 'ara durum',
    asamalar: Object.entries(E.ASAMALAR).map(([ad, g]) => ({ ad, gun: g, tarih: gunEkle(gun0, g) })),
    hukum: hukum.hukum, hukumMetni: hukum.metin, araRapor: !faz2,
    yeniKayitlar: { baslangic: kayitBas ? new Date(kayitBas).toISOString() : null, kapsam: yeniKayitKapsam,
      dosyalar: { alarmlar: !!alarmD, marj: !!marjL, mutabakat: !!mutL, golgeFarklar: !!golgeL, sapma: !!sapmaL, koruma: !!korumaL, sunucuAlarm: !!sunucuL }, kalpBasla: kalp.basla || null },
    olcutler,
    bilgi: { U7: { btAyakFunding: btF, btcusdtFunding: btcF, not: 'demo BTC ayağı funding — gerçekte spot teminat, funding yok (§6.1); eşik yok' },
      U8calismaDk: calismaDk.length ? { medyan: calismaDk[Math.floor(calismaDk.length / 2)], en: calismaDk[calismaDk.length - 1] } : null,
      yabanciDolum: yabanciDolum.length, risk: riskDurum ? { K3: riskDurum.K3 || null, hwm: riskDurum.hwm ?? null } : null,
      koruma: { olaySon100: (korumaJson.olaylar || []).length }, DCAeslesme: 'ölçülmüyor (§8.2 #11 — ayrı tasarım)' },
    G1: { satirlar: g1Satir, hukumSatiri: g1, ara: g1Ara, not: 'ikincil — yalnız MaxDD > p99 GEÇMEDİ; getiri/Sharpe hükme girmez' },
    ileriA, C, provalar, prova: { dosya: prova.dosya, var: prova.var, aciklama: prova.aciklamalar.length, inceleme: prova.incelemeler.length, surumOlaylari: prova.surumOlaylari, mudahale: prova.mudahaleler.length, mudahaleler: prova.mudahaleler.slice(-20) },
    not: 'Karar kullanıcıdadır. Protokol testnet/gerçek paraya geçişi önermez, başlatmaz (§0.1).',
  };
}

// ── Konsol ───────────────────────────────────────────────────────────────
function bicim(o) {
  const v = o.deger;
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (/^U[12]$|^I4a$|^I5$|^I7$|^I9$/.test(o.kod)) return `%${(v * 100).toFixed(2)}`;
  if (/^U[458]/.test(o.kod)) return `${v.toFixed(2)} bp`;
  return String(v);
}
function yazdir(r) {
  const satir = [];
  satir.push(`DEMO KABUL RAPORU — ${r.plan} · ${r.adGorunen || r.strateji}`);
  if (!r.veriVar) { satir.push(r.metin); return satir.join('\n'); }
  satir.push(`Gün 0 ${r.gun0} · bugün ${r.bugun} · geçen ${r.gecenGun} g · ${r.faz} · pencere ${r.pencere.bas} → ${r.pencere.bit}`);
  satir.push(`Aşamalar: ${r.asamalar.map(a => `${a.gun} g ${a.tarih}`).join(' · ')}`);
  satir.push(`§8.2 kayıtları: ${r.yeniKayitlar.baslangic ? `başlangıç ${r.yeniKayitlar.baslangic.slice(0, 16)} (kapsam ${r.yeniKayitlar.kapsam.gun} g${r.yeniKayitlar.kapsam.tam ? '' : ', Gün 0\'dan geç'})` : 'YOK (sunucuda 2026-10-15 sonrası canlı kod kurulmalı)'}`);
  satir.push('');
  satir.push(`${'ölçüt'.padEnd(5)} ${'değer'.padEnd(42)} ${r.faz.startsWith('Faz 2') ? 'durum' : 'şu anki bant (hüküm değil)'}`);
  const ara = !r.faz.startsWith('Faz 2');
  const d = (x) => (ara && x !== E.HUKUM.OLCULEMEDI ? `${x.toLocaleLowerCase('tr')} bandı` : x);   // ara raporda hüküm sözcüğü yok (§0.4)
  for (const o of r.olcutler) satir.push(`${o.kod.padEnd(5)} ${bicim(o).slice(0, 42).padEnd(42)} ${d(o.durum)}${o.not ? `  (${o.not})` : ''}`);
  const g = r.G1.ara;
  satir.push(`G1    ${g.olcu ? `getiri %${(g.olcu.getiri * 100).toFixed(1)} · MaxDD %${(g.olcu.maxdd * 100).toFixed(1)} · vol ${g.olcu.vol == null ? '—' : `%${(g.olcu.vol * 100).toFixed(1)}`}` : '—'} ↔ ${g.ufuk} g bandı  ${d(g.durum)}  (ikincil)`);
  satir.push(`PLAN-ILERI: A ${r.ileriA ? r.ileriA.durum : '—'} · ${Object.entries(r.C).map(([k, v]) => `${k} ${v.saglandi ? 'evet' : 'hayır'}`).join(' · ')}`);
  satir.push(`Provalar: ${r.provalar.map(p => `${p.no} ${p.yapildi ? (p.hukum || 'yapıldı') : 'yapılmadı'}`).join(' · ')}${r.prova.var ? '' : ' (prova günlüğü yok — --prova-sablon)'}`);
  satir.push('');
  satir.push(r.hukumMetni);
  satir.push(r.not);
  return satir.join('\n');
}
/* ── Sürücüler ─────────────────────────────────────────────────────────── */
/** Üreteci, referans isteğine `sagla(adim)` cevabıyla sonuna kadar yürütür (eşzamanlı). */
function surdur(gen, sagla) {
  let s = gen.next();
  while (!s.done) s = gen.next(sagla(s.value));
  return s.value;
}
/** Yalnız yerel önbellek — AĞ YOK. */
const yerelReferans = (adim) => ({ ref: jsonOku(adim.refDosya) || {}, hata: null });

/** Komut satırıyla aynı rapor; ağ kullanmaz (`ag` her zaman kapalı). */
function rapor(o = {}) { return surdur(raporAdimlari({ ...o, ag: false }), yerelReferans); }

/* ── Panel özeti (İleri test › Demo kabul kartı) ───────────────────────── */
const REF_IPUCU = 'komut satırında `node scripts/demo-kabul-rapor.js --ag` bir kez';
/** Ara raporda hüküm sözcüğü yok: "geçti bandında" (komut satırındaki "geçti bandı" ile aynı kural, §0.4). */
const durumEtiketi = (durum, ara) => (ara && durum !== H.OLCULEMEDI ? `${String(durum).toLocaleLowerCase('tr')} bandında` : durum);

function provaOzeti(provalar, prova) {
  const l = provalar.map(p => ({ no: p.no, ad: p.ad, zorunlu: p.zorunlu, sonra: p.sonra || null, yapildi: p.yapildi, hukum: p.hukum || null }));
  return { var: !!prova.var, dosya: prova.dosya ? (path.relative(KOK, prova.dosya) || prova.dosya) : null, provalar: l,
    yapilan: l.filter(p => p.yapildi).length, zorunlu: l.filter(p => p.zorunlu).length, zorunluYapilan: l.filter(p => p.zorunlu && p.yapildi).length,
    sablonKomutu: 'node scripts/demo-kabul-rapor.js --prova-sablon' };
}

const SINIF_AD = { cokme: 'çökme', 'sistem-kapanisi': 'sistem kapanışı', sayilmayan: 'sayılmayan' };
/**
 * 67.5: panel kartının katlı "Ayrıntı" bölümü — ölçütü oluşturan olaylar (en çok 50, en yeni sonda).
 * I2: ENGEL olayları (zaman, kaynak, metin) · I3a: sayılan alarm/uyarılar (tür, zaman) · I8: supervisor olayları (zaman, kod, sınıf).
 */
function panelAyrinti(x) {
  const a = x.ayrinti;
  if (!a) return null;
  const son = (l) => l.slice(-50);
  if (x.kod === 'I2' && Array.isArray(a.olaylar)) return { tur: 'olay', satirlar: son(a.olaylar.map(o => ({ zaman: o.zaman, kaynak: o.kaynak || null, metin: String(o.metin || '').slice(0, 200) }))) };
  if (x.kod === 'I3a' && Array.isArray(a.liste)) return { tur: 'alarm', turler: a.turler || {}, satirlar: son(a.liste) };
  if (x.kod === 'I8' && Array.isArray(a.olaylar)) return { tur: 'supervisor', cokme: a.cokme, sistemKapanisi: a.sistemKapanisi, sayilmayan: a.sayilmayan,
    satirlar: son(a.olaylar.map(o => ({ zaman: o.zaman, kod: o.kod, kodlar: o.kodlar, satir: o.satir, sinif: o.sinif, sinifAd: SINIF_AD[o.sinif] || o.sinif, aciklanmis: !!o.aciklanmis }))) };
  return null;
}

/**
 * Panel kartı için salt okur özet. `o` = rapor() seçenekleri (dizin, prova, simdi/bit, dosya yolları…).
 * HÜKÜM yalnız Faz 2'de (gecenGun ≥ 63); öncesinde `genel.hukum` null.
 */
function panelOzet(o = {}) {
  const dizin = o.dizin || yollar.veri('live', 'hucum-demo');
  const r = rapor(o);
  if (!r.veriVar) {
    // Gün 0 yok: yine de prova günlüğü ve §8.2 kayıtlarının durumunu göster (ölçüt yok, tarih uydurulmaz).
    const prova = provaYukle(o.prova || path.join(dizin, 'prova-gunlugu.json'));
    const mutL = jsonlOku(path.join(dizin, 'mutabakat.jsonl'));
    const bas = mutL && mutL.length ? Math.min(...mutL.map(x => x.zaman).filter(Number.isFinite)) : null;
    const provalar = E.PROVALAR.map(p => { const k = prova.provalar.filter(x => +x.no === p.no); const son = k[k.length - 1]; return { ...p, yapildi: k.length > 0, hukum: son ? (son.hukum || null) : null }; });
    return { plan: E.PLAN, veriVar: false, gun0: null, gun0Taban: E.GUN0_TABAN, bugun: r.bugun, gecenGun: 0, hedefGun: E.ASAMALAR.hukum, araRapor: true,
      metin: r.metin, asamalar: [], sonraki: null, yeniKayitlar: { baslangic: Number.isFinite(bas) ? new Date(bas).toISOString() : null, kapsam: null },
      prova: provaOzeti(provalar, prova), olcutler: [], g1: null, refEksik: false, refIpucu: REF_IPUCU,
      genel: { hukum: null, metin: 'Ara rapor — hüküm yok (Gün 0 henüz yok)' } };
  }
  const ara = !!r.araRapor;
  const asamalar = r.asamalar.filter(a => a.gun === E.ASAMALAR.ara || a.gun === E.ASAMALAR.hukum)
    .map(a => ({ gun: a.gun, ad: a.gun === E.ASAMALAR.hukum ? 'hüküm' : 'ara rapor', tarih: a.tarih, gecti: r.gecenGun >= a.gun }));
  const olcutler = r.olcutler.map(x => ({ kod: x.kod, ad: x.ad, deger: x.deger, durum: x.durum, etiket: durumEtiketi(x.durum, ara), not: x.not || null,
    kapsam: x.kapsam && x.kapsam.ilk && !x.kapsam.tam ? { gun: x.kapsam.gun, ilk: x.kapsam.ilk } : null,
    ...(x.bilgiNotu ? { bilgiNotu: x.bilgiNotu } : {}), ...(panelAyrinti(x) ? { ayrinti: panelAyrinti(x) } : {}) }));
  const u4 = r.olcutler.find(x => x.kod === 'U4');
  const g = r.G1 && r.G1.ara;
  return {
    plan: E.PLAN, veriVar: true, gun0: r.gun0, gun0Taban: E.GUN0_TABAN, bugun: r.bugun, gecenGun: r.gecenGun, hedefGun: E.ASAMALAR.hukum,
    faz: r.faz, araRapor: ara, pencere: r.pencere, asamalar, sonraki: asamalar.find(a => !a.gecti) || null,
    yeniKayitlar: { baslangic: r.yeniKayitlar.baslangic, kapsam: r.yeniKayitlar.kapsam, dosyalar: r.yeniKayitlar.dosyalar },
    prova: provaOzeti(r.provalar, r.prova),
    olcutler,
    g1: g ? { ufuk: g.ufuk, olcu: g.olcu || null, bant: g.bant || null, durum: g.durum, etiket: durumEtiketi(g.durum, ara) } : null,
    refEksik: !!(u4 && u4.durum === H.OLCULEMEDI && /--ag/.test(u4.not || '')), refIpucu: REF_IPUCU,
    genel: ara ? { hukum: null, metin: 'Ara rapor — hüküm yok (hüküm 63. günde verilir; ara rapor betimleyicidir)' } : { hukum: r.hukum, metin: r.hukumMetni },
    not: r.not
  };
}

module.exports = { supervisorOlaylari, I9_BILGI, rapor, raporAdimlari, surdur, panelOzet, durumEtiketi, S, genelHukum, yazdir, bicim, provaYukle, supervisorOku, defterOku, jsonOku, PROVA_SABLON, REF_IPUCU, KOK };
