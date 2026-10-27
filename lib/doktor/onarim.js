'use strict';
/**
 * PUSULA DOKTORU — ONARIM KURALLARI (F2, 78.2 adayı; tasarım: onarım araştırması C §3 · §4 · §5, kararlar K1–K7) — SAF modül:
 * dosya, ağ, alt süreç YOK. Eylemleri bu dosya YAPMAZ; yalnız "tetik var mı, bu hedefe şimdi dokunulabilir mi" der.
 * ═══════════════════════════════════════════════════════════════════════════
 * KULLANICI KARARI (2026-10-27): ilk 7 gün GÖLGE kipi — tetik oluşur, "şunu yapardım" kaydı düşülür, HİÇBİR eylem yapılmaz. Etkin kipe
 * yalnız kullanıcı geçirir (bu bilgisayardan, acil PIN + ONAR); Pusula kendi kipini DEĞİŞTİREMEZ. İzleme (gölge) kipine dönüş PIN'siz.
 *
 * KURALLAR (yalnız riski ARTIRMAYAN, kodla doğrulanmış adımlar — K2):
 *   D4 Veri kaynağını yeniden deneme   son güncelleme denemesi HATA vermiş VE veri bayat kaynak → veri orkestratörüne "bu kaynağı yeniden
 *                                       indir" (orkestratörün kendi talep yolu; kendi 15 dk / 30 dk sınırı ve Binance 418/429 beklemesi geçerli)
 *   D5 İleriye kayıtçıyı yeniden başlatma 6 saatten uzun yazmayan kayıtçı (öz denetim 'kayitci' ile aynı ölçü) ya da 6 saattir satır
 *                                       gelmeyen tasfiye akışı (ör. OKX) → kayıtçının KENDİ yöntemi (lib/ileriKayit yenile: REST için tek yeni
 *                                       deneme, akış için yeniden bağlanma). Botları etkilemez (yalnız ham veri).
 *   D6 Yedeği yeniden deneme            son yedek başarısız / 26 saatten eski, hedef disk erişilebilir ve boş yeri yetiyor → scripts/yedek.js
 *                                       (process.execPath, kabuk YOK). VARSAYILAN KAPALI (K4) — yönetici açar. TR 10:00–22:00, günde 1.
 *   D7 Telegram ulaşmıyor → ikinci kanal  giden kutusunda 30 dk'dan eski ileti var ve o zamandan beri başarılı gönderim yok → bekleyen
 *                                       iletilerin BAŞLIKLARI tek ileti olarak ikinci kanala (ntfy; kuruluysa)
 *   D8 Sessiz saatte yeniden başlatma   KURAL YOK (K5): onarım araştırması B'de "yeniden başlatma çözer" diye kodla doğrulanan belirtilerin
 *                                       hepsini (bellek şişmesi, takılan bot işi) öz denetim ZATEN kendisi yeniden başlatarak onarıyor; geri
 *                                       kalanlar yeniden başlatmayla düzelmiyor ya da güvenlik kapısını atlıyor (D8_ELENEN). Liste boş → kural yok.
 *
 * ORTAK SINIRLAR (her kural, her kip — gölgede de aynı sınırlarla "yapardım" denir):
 *   · TR 02:30–04:30 hiçbir eylem (botların karar penceresi; kurallar.yasakSaatMi)        · açılıştan sonraki ilk 15 dk hiçbir eylem
 *   · bot günlük çalışması sürerken hiçbir eylem (öz denetim _mesgulMu)                   · "bilinmiyor" (girdi okunamadı) → eylem yok
 *   · Kairos (demo kabul, 2026-12-09 21:00Z'ye kadar) hiçbir kuralın hedefi olamaz       · ön koşul eksikse (engel) → eylem yok
 *   · hedef başına aralık + 24 saatte tavan (sayaçlar <veri>/doktor/motor.json — yeniden başlatmada sıfırlanmaz)
 *   · aynı eylem art arda 3 kez başarısız → kural o hedef için 24 saat durur ve yöneticiye DEVREDER (Telegram + Sorunlar kartı
 *     doktor-devretti + Onarım Rehberi kart kimliği); 24 saat sonra tek deneme (başarısızsa yeniden devreder). 24 saat hatasız → sayaç sıfır.
 */
const K = require('./kurallar');
const { DK, SAAT, GUN } = K;

const KIPLER = Object.freeze(['golge', 'etkin', 'kapali']);
const KIP_AD = Object.freeze({ golge: 'gölge (izleme)', etkin: 'etkin', kapali: 'kapalı' });
const GOLGE_GUN = 7;                 // kullanıcı kararı: ilk 7 gün gölge; dolunca bir kez "gölge sonuçlarına bakıp karar verin"
const GOLGE_KART_GUN = 14;           // Sorunlar'daki doktor-golge-ozeti kartı gölgenin 7.–14. günleri arasında görünür
const ACILIS_BEKLE_MS = 15 * DK;
const DEVRE_MS = 24 * SAAT;
const ESIK_BASARISIZ = 3;
const SIFIRLA_MS = 24 * SAAT;
const PENCERE_MS = 24 * SAAT;        // "günde N" = son 24 saat (yuvarlanan pencere — gün dönümünde iki kat deneme olmaz)
const TELEGRAM_BEKLE_MS = 30 * DK;   // D7: giden kutusundaki en eski ileti bu kadar bekliyorsa
const YEDEK_YAS_MS = 26 * SAAT;      // D6: öz denetim 'yedek' ile aynı (AYAR.yedekSaat)
const YEDEK_VARSAYILAN_BAYT = 1024 * 1024 * 1024;   // D6: son başarılı yedeğin boyutu bilinmiyorsa 1 GB varsayılır (× 2 boş yer)

/**
 * Kural tablosu. eylem: lib/sunucu/doktorUclari.js beyaz listesindeki eylem kimliği (öz test birebir eşlemeyi denetler).
 * rehber: Onarım Rehberi kartı (kayitlar/rehber/senaryolar.json) · kilavuz: sorun-giderme.md başlığı.
 */
const KURALLAR = Object.freeze([
  { kimlik: 'D4', ad: 'Veri kaynağını yeniden deneme', eylem: 'veri-yeniden', varsayilan: true,
    sinir: { aralikMs: 6 * SAAT, gunluk: 3 }, dogrulaMs: 45 * DK, rehber: 'S-100', kilavuz: 'veri-kaynagi',
    tetikMetni: 'Bir veri kaynağının son güncelleme denemesi hata verdi ve veri bayat.',
    eylemMetni: 'Veri yöneticisine o kaynağı yeniden indirmesini söyler (veri yöneticisinin kendi bekleme kuralları geçerli).',
    sinirMetni: 'Kaynak başına 6 saatte bir, günde en çok 3 kez; Binance hız sınırı beklemesinde ve veri indirme sürerken denenmez.' },
  { kimlik: 'D5', ad: 'İleriye kayıtçıyı yeniden başlatma', eylem: 'kayitci-yenile', varsayilan: true,
    sinir: { aralikMs: 3 * SAAT, gunluk: 2 }, dogrulaMs: 30 * DK, rehber: 'S-102', kilavuz: 'ileriye-kayit',
    tetikMetni: 'Bir ileriye kayıtçı 6 saatten uzun süredir yazmıyor ya da bir tasfiye akışından (ör. OKX) 6 saattir satır gelmiyor.',
    eylemMetni: 'Kayıtçının kendi yeniden deneme / yeniden bağlanma yöntemini bir kez çalıştırır. Botları etkilemez (yalnız ham veri).',
    sinirMetni: 'Kayıtçı başına 3 saatte bir, günde en çok 2 kez.' },
  { kimlik: 'D6', ad: 'Yedeği yeniden deneme', eylem: 'yedek-yeniden', varsayilan: false,
    sinir: { aralikMs: 20 * SAAT, gunluk: 1, saat: [10, 22] }, dogrulaMs: 0, rehber: 'S-105', kilavuz: 'yedek',
    tetikMetni: 'Son yedek başarısız ya da 26 saatten eski; yedek diski erişilebilir ve boş yeri yetiyor.',
    eylemMetni: 'Günlük yedek komutunu bir kez daha çalıştırır (her gün 05:30\'da çalışan komutun aynısı).',
    sinirMetni: 'Günde en çok 1 kez, yalnız TR 10:00–22:00. VARSAYILAN KAPALI — siz açarsınız.' },
  { kimlik: 'D7', ad: 'Telegram ulaşmıyorsa ikinci kanala özet', eylem: 'ikinci-kanal', varsayilan: true,
    sinir: { aralikMs: 2 * SAAT, gunluk: 6 }, dogrulaMs: 0, rehber: 'S-087', kilavuz: 'telegram-kuyruk',
    tetikMetni: 'Telegram\'a gönderilemeyen iletiler 30 dakikadan uzun süredir giden kutusunda bekliyor.',
    eylemMetni: 'Bekleyen iletilerin başlıklarını tek ileti olarak ikinci kanala (ntfy) gönderir. İkinci kanal kurulu değilse bir şey yapmaz.',
    sinirMetni: '2 saatte bir, günde en çok 6 kez.' },
]);
const KURAL = Object.freeze(Object.fromEntries(KURALLAR.map(r => [r.kimlik, r])));

/** D8 (K5): B envanterindeki "yeniden başlatma çözer" belirtileri — boş liste = kural yok. Elenenler ve gerekçe (panel + kılavuz). */
const D8_BELIRTILER = Object.freeze([]);
const D8_ELENEN = Object.freeze([
  { senaryo: 'S-015', belirti: 'Bellek şişti', neden: 'Öz denetim zaten sessiz saatte yeniden başlatıyor — Doktor ikinci kez yapmaz.' },
  { senaryo: 'S-023', belirti: 'Botun işi takıldı', neden: 'Öz denetim zaten yeniden başlatıyor (Kairos\'ta yalnız haber) — Doktor ikinci kez yapmaz.' },
  { senaryo: 'S-031', belirti: 'Yeni kod indi, Pusula yeniden başlatılmalı', neden: 'Yeniden başlatma güncellemenin açılış sağlığı / 8 dk gözlem / geri alma adımlarını atlar; karar sizde kalır.' },
  { senaryo: 'S-022', belirti: 'Denetleyicisiz başlatılmış', neden: 'Denetleyici yokken yeniden başlatma Pusula\'yı KAPALI bırakır.' },
]);

const ORTAK_SINIRLAR = Object.freeze([
  'TR 02:30–04:30 arası hiçbir şey yapmaz (botların karar saati).',
  'Pusula açıldıktan sonraki ilk 15 dakika ve botun günlük çalışması sürerken hiçbir şey yapmaz.',
  'Kairos\'a (demo kabulü, 2026-12-09\'a kadar) dokunan hiçbir şey yapmaz.',
  'Bir şeyi ölçemezse ("bilinmiyor") hiçbir şey yapmaz.',
  'Aynı iş art arda 3 kez olmazsa durur ve size devreder: Telegram + Sorunlar kartı + Onarım Rehberi kartı. 24 saat sonra tek kez yeniden dener.',
  'Her denemeyi ve her "yapardım" kararını onarım kaydına yazar: ne gördü, ne yaptı, sonra ne oldu.',
]);

/** Kurallar dışındaki "asla" listesi — panel ve kılavuz aynı metni gösterir (C §3 "Asla otomatik olmayacaklar"). */
const ASLA = Object.freeze([
  'Pozisyon açmaz, kapatmaz, küçültmez; emir vermez; acil durdurma yapmaz.',
  'ENGEL kaldırmaz, güvenli kipten çıkarmaz, "Borsayla karşılaştır" yapmaz.',
  'Ayar gevşetmez; para akışı / sapma / yatırma kabul etmez; canlı hesaba geçmez; güncelleme onaylamaz.',
  'Devralma / bot taşıma yapmaz; veri, günlük, yedek silmez.',
  'Kod ya da ayar dosyası yazmaz; PowerShell / komut penceresi açmaz; başka program kapatmaz.',
  'Pusula\'yı yeniden başlatmaz (bu sürümde böyle bir kural yok).',
]);

const kirp = (s, n = 200) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const trSaat = (ms) => { const d = new Date(ms + 3 * SAAT); return d.getUTCHours(); };

// ── Tetikler: girdi → { durum: var | yok | bilinmiyor, ayrinti, hedefler: [{ kimlik, ad, engel?, bot?, once }] } ────────────────

/** D4. v = veri orkestratörü durum() | null */
function d4Veri(v) {
  if (!v || !Array.isArray(v.kaynaklar)) return { durum: 'bilinmiyor', ayrinti: 'veri durumu okunamadı', hedefler: [] };
  const l = v.kaynaklar.filter(s => s && s.tur !== 'harici' && s.durum === 'hata' && s.bayat === true);
  if (!l.length) {
    const hatali = v.kaynaklar.filter(s => s && s.durum === 'hata').length;
    return { durum: 'yok', ayrinti: hatali ? `${hatali} kaynakta son deneme hatalı ama veri henüz bayat değil — beklenir` : 'güncellenemeyen kaynak yok', hedefler: [] };
  }
  const engel = v.binanceBekleme ? `Binance hız sınırı beklemesi sürüyor (${v.binanceBekleme.bitis || '?'})` : v.calisiyor ? 'veri indirme şu an sürüyor' : null;
  return { durum: 'var', ayrinti: l.map(s => s.kisaAd || s.ad).join(', '), hedefler: l.map(s => ({ kimlik: `veri:${s.ad}`, ad: s.ad, hedefAd: s.kisaAd || s.ad, engel,
    once: { durum: s.durum, veriGunu: s.veriGunu || null, hata: kirp(s.hata, 160), sonBasari: s.sonBasari || null } })) };
}

/** D5. k = ileriye kayıt saglik() | null — { calisiyor, neden, gecikenler: [{ ad, kisaAd, saat, hata }], sessizAkislar: [{ ad, kisaAd, saat }] } */
function d5Kayitci(k) {
  if (!k) return { durum: 'bilinmiyor', ayrinti: 'kayıtçı durumu okunamadı', hedefler: [] };
  if (!k.calisiyor) return { durum: 'yok', ayrinti: k.neden || 'kayıtçılar kapalı', hedefler: [] };
  const h = [
    ...(k.gecikenler || []).map(g => ({ kimlik: `kayitci:${g.ad}`, ad: g.ad, tur: 'kayitci', hedefAd: g.kisaAd || g.ad, once: { saat: g.saat, hata: kirp(g.hata, 160) } })),
    ...(k.sessizAkislar || []).map(g => ({ kimlik: `akis:${g.ad}`, ad: g.ad, tur: 'akis', hedefAd: g.kisaAd || `Tasfiye akışı (${g.ad})`, once: { saat: g.saat, bagli: g.bagli, hata: kirp(g.hata, 160) } })),
  ];
  if (!h.length) return { durum: 'yok', ayrinti: `${k.toplam || ''} kayıtçı yazıyor`.trim(), hedefler: [] };
  return { durum: 'var', ayrinti: h.map(x => `${x.hedefAd}${Number.isFinite(x.once.saat) ? ` (${String(x.once.saat).replace('.', ',')} sa)` : ''}`).join(', '), hedefler: h };
}

/** D6. y = { son: { zaman, hata, bayt }, hedef, erisim: { var, bos } | null, gerekli } | null */
function d6Yedek(y, simdi) {
  if (!y) return { durum: 'bilinmiyor', ayrinti: 'yedek kaydı okunamadı', hedefler: [] };
  const son = y.son || null;
  const z = son ? Date.parse(son.zaman) : NaN;
  const sorun = !son ? 'henüz yedek alınmamış' : son.hata ? `son yedek başarısız: ${kirp(son.hata, 120)}` : (!Number.isFinite(z) || simdi - z > YEDEK_YAS_MS) ? 'son yedek 26 saatten eski' : null;
  if (!sorun) return { durum: 'yok', ayrinti: 'son yedek tamam', hedefler: [] };
  if (!son) return { durum: 'yok', ayrinti: 'yedek hiç kurulmamış — Doktor kurulum yapmaz (Ayarlar › Yedek ve taşıma)', hedefler: [] };
  const e = y.erisim;
  const gerekli = Number.isFinite(y.gerekli) && y.gerekli > 0 ? y.gerekli : YEDEK_VARSAYILAN_BAYT;
  let engel = null;
  if (!e) engel = 'yedek diskinin boş yeri ölçülemedi';
  else if (!e.var) engel = 'yedek diski / klasörü erişilebilir değil (USB takılı mı?)';
  else if (!Number.isFinite(e.bos) || e.bos < 2 * gerekli) engel = 'yedek diskinde yeterli boş yer yok';
  return { durum: 'var', ayrinti: sorun, hedefler: [{ kimlik: 'yedek', ad: 'yedek', hedefAd: 'Günlük yedek', engel, once: { sorun, bos: e && Number.isFinite(e.bos) ? e.bos : null } }] };
}

/** D7. t = { kuyruk, enEski (ms), sonBasari (ms|null), ikinciKanal (bool), basliklar } | null */
function d7Telegram(t, simdi) {
  if (!t || !Number.isFinite(t.kuyruk)) return { durum: 'bilinmiyor', ayrinti: 'Telegram giden kutusu okunamadı', hedefler: [] };
  if (!t.kuyruk) return { durum: 'yok', ayrinti: 'giden kutusu boş', hedefler: [] };
  const yas = Number.isFinite(t.enEski) ? simdi - t.enEski : NaN;
  if (!Number.isFinite(yas)) return { durum: 'bilinmiyor', ayrinti: 'giden kutusundaki iletinin zamanı okunamadı', hedefler: [] };
  if (yas < TELEGRAM_BEKLE_MS) return { durum: 'yok', ayrinti: `${t.kuyruk} ileti 30 dakikadan kısa süredir bekliyor`, hedefler: [] };
  if (Number.isFinite(t.sonBasari) && t.sonBasari > t.enEski) return { durum: 'yok', ayrinti: 'Telegram yeniden ulaşıyor (giden kutusu boşalıyor)', hedefler: [] };
  return { durum: 'var', ayrinti: `${t.kuyruk} ileti ${K.sureMetni(yas)} bekliyor`, hedefler: [{ kimlik: 'telegram', ad: 'telegram', hedefAd: 'Telegram giden kutusu',
    engel: t.ikinciKanal ? null : 'ikinci kanal (ntfy) kurulu değil — Ayarlar › Bildirimler', once: { kuyruk: t.kuyruk, bekleme: K.sureMetni(yas) }, basliklar: (t.basliklar || []).slice(0, 8).map(b => kirp(b, 100)) }] };
}

const TETIK = Object.freeze({ D4: (g) => d4Veri(g.veri), D5: (g) => d5Kayitci(g.kayitci), D6: (g, t) => d6Yedek(g.yedek, t), D7: (g, t) => d7Telegram(g.telegram, t) });

/** Saf: bütün kuralların tetiği. Hata atan tetik "bilinmiyor" sayılır (asla "yok" değil). */
function degerlendir(g = {}, simdi = Date.now()) {
  return KURALLAR.map(r => {
    let s;
    try { s = TETIK[r.kimlik](g, simdi) || { durum: 'bilinmiyor', ayrinti: '', hedefler: [] }; } catch (e) { s = { durum: 'bilinmiyor', ayrinti: `kural hesaplanamadı: ${kirp(e.message, 120)}`, hedefler: [] }; }
    return { kural: r.kimlik, durum: s.durum, ayrinti: s.ayrinti || '', hedefler: s.durum === 'var' ? (s.hedefler || []) : [] };
  });
}

// ── Sayaç (kalıcı; motorDurum.js yazar) ────────────────────────────────────────
function yeniSayac() { return { denemeler: [], ardisik: 0, sonBasarisiz: null, devretti: null, yariAcik: false, bekleyen: null, sonKarar: null }; }
/** Saf (yerinde): 24 saatten eski denemeleri at; 24 saat hatasız geçtiyse art arda başarısızlık sayacını sıfırla (devredilmişse sıfırlanmaz). */
function sayacTemizle(s, simdi) {
  s.denemeler = (s.denemeler || []).filter(z => Number.isFinite(z) && simdi - z < PENCERE_MS);
  if (s.ardisik > 0 && !s.devretti && Number.isFinite(s.sonBasarisiz) && simdi - s.sonBasarisiz >= SIFIRLA_MS) s.ardisik = 0;
  return s;
}

/**
 * Saf: bu hedefe şimdi dokunulabilir mi. @returns { izin, neden, yariAcik }
 * @param o { kural, hedef, simdi, sayac, acilis (ms), mesgul (bool|null), kip, kuralAcik }
 */
function kontrol(o) {
  const r = typeof o.kural === 'string' ? KURAL[o.kural] : o.kural;
  const t = o.simdi;
  const s = o.sayac || yeniSayac();
  const red = (neden) => ({ izin: false, neden });
  if (!r) return red('tanımsız kural');
  if (o.kip === 'kapali' || !KIPLER.includes(o.kip)) return red('onarım motoru kapalı');
  if (!o.kuralAcik) return red('kural kapalı');
  if (!Number.isFinite(t)) return red('saat okunamadı');
  if (K.yasakSaatMi(t)) return red('TR 02:30–04:30 (karar saati)');
  if (!Number.isFinite(o.acilis) || t - o.acilis < ACILIS_BEKLE_MS) return red('Pusula yeni açıldı (ilk 15 dk)');
  if (o.mesgul !== false) return red(o.mesgul == null ? 'botların çalışıp çalışmadığı okunamadı' : 'botun günlük çalışması sürüyor');
  const h = o.hedef || {};
  if (h.bot && K.kairosSuruyor(t) && (h.bot === 'hucum' || h.demo)) return red('Kairos demo kabulü — dokunulmaz');
  if (h.engel) return red(h.engel);
  if (r.sinir.saat) { const sa = trSaat(t); if (sa < r.sinir.saat[0] || sa >= r.sinir.saat[1]) return red(`yalnız TR ${r.sinir.saat[0]}:00–${r.sinir.saat[1]}:00`); }
  if (s.bekleyen) return red('önceki deneme doğrulanıyor');
  let yariAcik = false;
  if (s.devretti) {
    if (t - s.devretti < DEVRE_MS) return red(`size devredildi — ${K.sureMetni(DEVRE_MS - (t - s.devretti))} sonra tek kez yeniden dener`);
    yariAcik = true;
  }
  const den = (s.denemeler || []).filter(z => Number.isFinite(z) && t - z < PENCERE_MS);
  const son = den.length ? Math.max(...den) : null;
  if (son != null && t - son < r.sinir.aralikMs) return red(`son deneme ${K.sureMetni(t - son)} önce (en az ${K.sureMetni(r.sinir.aralikMs)} arayla)`);
  if (den.length >= r.sinir.gunluk) return red(`24 saatte ${r.sinir.gunluk} deneme doldu`);
  return { izin: true, neden: null, yariAcik };
}

/** Saf: gölge gün sayacı. */
function golgeDurumu(d, simdi) {
  const bas = Number(d && d.golgeBas);
  if (!d || d.kip !== 'golge' || !Number.isFinite(bas)) return { gun: null, doldu: false, kalanGun: null, kartGoster: false };
  const gun = (simdi - bas) / GUN;
  return { gun: Math.max(0, Math.floor(gun * 10) / 10), doldu: gun >= GOLGE_GUN, kalanGun: Math.max(0, Math.ceil(GOLGE_GUN - gun)), kartGoster: gun >= GOLGE_GUN && gun < GOLGE_KART_GUN, bas };
}

module.exports = { KIPLER, KIP_AD, GOLGE_GUN, GOLGE_KART_GUN, ACILIS_BEKLE_MS, DEVRE_MS, ESIK_BASARISIZ, SIFIRLA_MS, PENCERE_MS, TELEGRAM_BEKLE_MS, YEDEK_YAS_MS,
  KURALLAR, KURAL, D8_BELIRTILER, D8_ELENEN, ORTAK_SINIRLAR, ASLA, degerlendir, kontrol, yeniSayac, sayacTemizle, golgeDurumu, d4Veri, d5Kayitci, d6Yedek, d7Telegram };
