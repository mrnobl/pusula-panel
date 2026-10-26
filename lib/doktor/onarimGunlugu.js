'use strict';
/**
 * PUSULA DOKTORU — ONARIM GÜNLÜĞÜ (F1, 78.1) — SAF modül: "bugün ne kendiliğinden düzeldi?" tek listede.
 * ═══════════════════════════════════════════════════════════════════════════
 * YENİ YAZMA KANCASI YOK (K7): Pusula'nın onarımları bugün kendi kayıtlarına yazılıyor; bu modül o kayıtları DESENLE okur:
 *   olay akışı (lib/olayAkisi.js — öz denetim olayları, bot alarm kayıtları, güncelleme geçmişi, açılışlar, bildirimler)
 *   günlük satırları (lib/gunluk.js — açılış yeniden bağlanma, otomatik mutabakat, felaket stopunu yeniden koyma)
 *   Doktor'un kendi sicili (<veri>/doktor/sicil.jsonl — D1 döndürme, D2 temizlik)
 * Satır: { z, tur (ONARIM_TURLERI kimliği), sonuc: onarildi | duzeldi | koruma | olmadi | atlandi, baslik, ayrinti, bot, kaynak, kimlik }.
 *   onarildi  Pusula bir şeyi kendisi düzeltti        duzeldi  sorun kendiliğinden geçti
 *   koruma    Pusula koruyucu adım attı (güvenli kip)   olmadi   onarım denendi, olmadı (size kaldı)
 *   atlandi   Doktor bakım işini bilerek yapmadı (dosya açık / yasak saat)
 * Tutar yazılmaz (kaynak satırlarında da yok).
 */
const crypto = require('crypto');

const kimlikUret = (...p) => crypto.createHash('sha256').update(p.map(x => String(x == null ? '' : x)).join('|')).digest('hex').slice(0, 12);
const kisalt = (s, n = 240) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const SONUC = Object.freeze(['onarildi', 'duzeldi', 'koruma', 'olmadi', 'atlandi']);
const SONUC_AD = Object.freeze({ onarildi: 'kendisi onardı', duzeldi: 'kendiliğinden düzeldi', koruma: 'koruyucu adım', olmadi: 'olmadı — size kaldı', atlandi: 'atlandı' });

function satir(o) {
  const z = Number(o.z);
  if (!Number.isFinite(z) || z <= 0 || !SONUC.includes(o.sonuc)) return null;
  const baslik = kisalt(o.baslik, 200);
  if (!baslik) return null;
  return { z, tur: o.tur, sonuc: o.sonuc, sonucAd: SONUC_AD[o.sonuc], baslik, ayrinti: o.ayrinti ? kisalt(o.ayrinti, 400) : null, bot: o.bot || null,
    kaynak: o.kaynak || null, kimlik: o.kimlik || kimlikUret(o.kaynak, z, o.tur, baslik) };
}

/** Öz denetim denetim kimliği → onarım türü (olay akışı özeti "Öz denetim · <kimlik>: <fiil>"). */
const OZ_TUR = { kilit: 'oz-onarim', disk: 'oz-onarim', bellek: 'oz-onarim', donma: 'donma', internet: 'baglanti', baglanti: 'baglanti', fiyat: 'guvenli-kip', bakim: 'guvenli-kip', dosya: 'dosya' };
/** Saf: olay akışı satırı (lib/olayAkisi.js olay()) → onarım satırı | null. */
function olaydan(x) {
  if (!x || !x.ozet) return null;
  const o = String(x.ozet), ay = x.ayrinti || null, ortak = { z: x.z, bot: x.bot || null, kaynak: `olay:${x.kaynak || ''}`, kimlik: `o-${x.kimlik || kimlikUret(x.z, o)}` };
  if (x.kaynak === 'oz-denetim') {
    const m = /^Öz denetim · ([^:]+): (kendisi onardı|onaramadı|düzeldi)$/.exec(o);
    if (!m) return null;
    const tur = OZ_TUR[m[1]] || 'oz-onarim';
    if (m[2] === 'kendisi onardı') return satir({ ...ortak, tur, sonuc: 'onarildi', baslik: `Öz denetim onardı: ${m[1]}`, ayrinti: ay });
    if (m[2] === 'onaramadı') return satir({ ...ortak, tur, sonuc: 'olmadi', baslik: `Öz denetim onaramadı: ${m[1]}`, ayrinti: ay });
    return satir({ ...ortak, tur, sonuc: 'duzeldi', baslik: `Düzeldi: ${m[1]}`, ayrinti: ay });
  }
  if (x.kaynak === 'bot-alarm') {
    if (/^ENGEL kendiliğinden kalktı/.test(o)) return satir({ ...ortak, tur: 'engel-kalkti', sonuc: 'duzeldi', baslik: 'ENGEL kendiliğinden kalktı', ayrinti: ay });
    if (/^Güvenli kip bitti/.test(o)) return satir({ ...ortak, tur: 'guvenli-kip', sonuc: 'duzeldi', baslik: o, ayrinti: ay });
    if (/^Güvenli kip: günlük karar ertelendi/.test(o)) return satir({ ...ortak, tur: 'guvenli-kip', sonuc: 'koruma', baslik: o, ayrinti: ay });
    return null;
  }
  if (x.kaynak === 'guncelleme' && /GERİ ALINDI/.test(o)) return satir({ ...ortak, tur: 'guncelleme-geri', sonuc: 'onarildi', baslik: `${o} — eski sürüme dönüldü`, ayrinti: ay });
  if (x.kaynak === 'acilis' && /^Pusula açıldı$/.test(o)) return satir({ ...ortak, tur: 'acilis', sonuc: 'onarildi', baslik: 'Pusula yeniden açıldı (önceki kapanış planlı değildi)', ayrinti: 'Denetleyici ya da bekçi görevi açtı — ya da bilgisayar yeniden başladı.' });
  if (x.kaynak === 'bildirim' && /son iyi kopya|son sağlam kopya|\.yedek/i.test(o + ' ' + (ay || ''))) return satir({ ...ortak, tur: 'dosya', sonuc: 'onarildi', baslik: o, ayrinti: 'Bozuk dosya son sağlam kopyadan açıldı.' });
  return null;
}

/** Günlük satırı desenleri (lib/gunluk.js { t, s, k, b, m }). Yalnız kesin ifadeler — kodda yazan iletilerle birebir. */
const GUNLUK_DESEN = [
  // lib/sunucu/botYonetimi.js acilisBaglan: "[<ad>] açılış bağlantısı N. denemede kuruldu" (N ≥ 2 — ilk deneme onarım değil)
  { re: /\[([^\]]+)\] açılış bağlantısı (\d+)\. denemede kuruldu/, tur: 'baglanti', sonuc: 'onarildi', bas: (m) => `Açılışta borsaya bağlantı ${m[2]}. denemede kuruldu`, bot: (m) => m[1], kosul: (m) => Number(m[2]) >= 2 },
  // lib/live/yurutucu.js otomatikCikis: "Yürütücü otomatik mutabakatla AKTIF (önceki: …)"
  { re: /Yürütücü otomatik mutabakatla AKTIF(?: \(önceki: ([^)]*)\))?/, tur: 'mutabakat', sonuc: 'onarildi', bas: () => 'Borsa geri çekilmesi bitti — yürütücü borsayla karşılaştırıp kendini açtı', ay: (m) => (m[1] ? `önceki: ${m[1]}` : null) },
  // lib/live/korumaEmri.js denetle: "Felaket stopu: <sembol> felaket stopu borsada yok, tetiklenmedi (elle iptal?) — yeniden konuyor."
  { re: /Felaket stopu: (\S+) felaket stopu borsada yok, tetiklenmedi.*yeniden konuyor/, tur: 'stop', sonuc: 'onarildi', bas: (m) => `${m[1]}: kaybolan felaket stopu yeniden konuyor` },
  { re: /Felaket stopu: (\S+) belirsiz stop \S+ borsada yok \(konmamış\) — yeniden konacak/, tur: 'stop', sonuc: 'onarildi', bas: (m) => `${m[1]}: konmamış felaket stopu yeniden konacak` },
];
/** Saf: günlük satırı → onarım satırı | null. botBul(metin) → bot kimliği (görünen addan). */
function gunluktan(x, { botBul } = {}) {
  if (!x || typeof x.m !== 'string') return null;
  const z = Date.parse(x.t);
  for (const d of GUNLUK_DESEN) {
    const m = d.re.exec(x.m);
    if (!m || (d.kosul && !d.kosul(m))) continue;
    const ham = d.bot ? d.bot(m) : (x.b || null);
    const bot = (ham && typeof botBul === 'function' && botBul(ham)) || ham || null;
    return satir({ z, tur: d.tur, sonuc: d.sonuc, baslik: d.bas(m), ayrinti: d.ay ? d.ay(m) : null, bot, kaynak: 'gunluk', kimlik: `g-${kimlikUret(x.t, x.m)}` });
  }
  return null;
}

/** Saf: Doktor sicili satırı → onarım satırı | null. */
function sicilden(x) {
  if (!x || !x.is) return null;
  if (x.is === 'D1') {
    const dosya = x.dosya || 'günlük';
    if (x.sonuc === 'dondu') return satir({ z: x.z, tur: 'doktor-dondur', sonuc: 'onarildi', baslik: `${dosya} döndürüldü (${x.boyutMetin || 'büyük'}) — eski kopya ${dosya}.1`, kaynak: 'doktor', kimlik: `d-${kimlikUret(x.z, x.is, dosya)}` });
    if (x.sonuc === 'atlandi') return satir({ z: x.z, tur: 'doktor-dondur', sonuc: 'atlandi', baslik: `${dosya} döndürülmedi: ${x.neden || 'bilinmeyen neden'}`, kaynak: 'doktor', kimlik: `d-${kimlikUret(x.z, x.is, dosya, 'a')}` });
    return null;
  }
  if (x.is === 'D2') {
    if (x.sonuc === 'silindi' && x.sayi > 0) return satir({ z: x.z, tur: 'doktor-temizlik', sonuc: 'onarildi', baslik: `${x.sayi} geçici tatbikat klasörü silindi (24 saatten eski)`, ayrinti: Array.isArray(x.adlar) ? x.adlar.slice(0, 6).join(', ') : null, kaynak: 'doktor', kimlik: `d-${kimlikUret(x.z, x.is)}` });
    if (x.sonuc === 'hata' && x.sayi > 0) return satir({ z: x.z, tur: 'doktor-temizlik', sonuc: 'olmadi', baslik: `${x.sayi} geçici klasör silinemedi (yarın yeniden denenir)`, ayrinti: x.neden || null, kaynak: 'doktor', kimlik: `d-${kimlikUret(x.z, x.is, 'h')}` });
    return null;
  }
  return null;
}

/**
 * Saf: kaynakları birleştirir, en yeni önce, kimliğe göre tekil.
 * @param o { olaylar: [olay akışı satırı], gunluk: [günlük satırı], sicil: [sicil satırı], bas (ms), n, botBul }
 */
function birlestir(o = {}) {
  const bas = Number.isFinite(o.bas) ? o.bas : 0;
  const l = [];
  for (const x of o.olaylar || []) { const s = olaydan(x); if (s) l.push(s); }
  for (const x of o.gunluk || []) { const s = gunluktan(x, { botBul: o.botBul }); if (s) l.push(s); }
  for (const x of o.sicil || []) { const s = sicilden(x); if (s) l.push(s); }
  const gor = new Set();
  const tekil = l.filter(s => s.z >= bas && !gor.has(s.kimlik) && gor.add(s.kimlik)).sort((a, b) => b.z - a.z);
  const n = Math.max(1, Math.min(500, Number(o.n) || 200));
  const sayilar = Object.fromEntries(SONUC.map(s => [s, tekil.filter(x => x.sonuc === s).length]));
  return { satirlar: tekil.slice(0, n), toplam: tekil.length, kesildi: tekil.length > n, sayilar };
}

module.exports = { olaydan, gunluktan, sicilden, birlestir, GUNLUK_DESEN, SONUC, SONUC_AD };
