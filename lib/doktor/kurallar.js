'use strict';
/**
 * PUSULA DOKTORU — KURALLAR (F1, 78.1; tasarım: onarım araştırması C §3–§5, kararlar K1–K7) — SAF modül: dosya, ağ, alt süreç YOK.
 * ═══════════════════════════════════════════════════════════════════════════
 * Doktor bir yapay zekâ ajanı DEĞİLDİR (K1): sabit, test edilmiş kurallar. F1'de yalnız TEŞHİS yapar ("şu an ne bozuk, anlamı ne,
 * kendiliğinden düzelir mi, siz ne yapmalısınız") ve Pusula'nın BUGÜN ZATEN kendiliğinden yaptığı onarımları tek listede gösterir.
 * İki zararsız bakım işi vardır (K2 — riski artırmayan): D1 konsol günlüğü döndürme (açılışta), D2 geçici tatbikat artığı temizliği
 * (günde bir). Bayat kilit (D3) yalnız RAPOR edilir. Hazır olmama (D10) asla yeniden başlatma değildir (K6).
 *
 * ORTAK SINIRLAR (bütün bakım işleri):
 *   · Yasak saat TR 02:30–04:30 (UTC 23:30–01:30; botların günlük karar penceresi) — lib/sorunAraclari.js ybPencerede ile AYNI.
 *   · Kairos demo kabulü (2026-12-09 21:00Z'ye kadar, lib/ozDenetim.js AYAR.demoKorumaBitis ile aynı) — Doktor hiçbir bota dokunmaz;
 *     ayrıca demo kabul raporunun okuduğu supervisor.log bu tarihten 14 gün sonrasına kadar döndürülmez.
 *   · "Bilinmiyor" (veri okunamadı) asla "sorun yok" sayılmaz ve hiçbir işe yol açmaz.
 *   · Doktor dosyalarını canlı bot kodu (lib/live, lib/risk, engine, exchange …; lib/guncelleme.js canliKumesi) ÇAĞIRMAZ (K7).
 */

const DK = 60000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;
const TR = 3 * SAAT;   // Türkiye UTC+3 (yaz saati yok)

/** Kairos demo kabul bitişi (lib/ozDenetim.js AYAR.demoKorumaBitis ile aynı; öz test eşitliği denetler). */
const KAIROS_BITIS = Date.parse('2026-12-09T21:00:00Z');
/** supervisor.log demo kabul raporunun (lib/ileri/demoKabulRapor.js I8) kaynağı — bitişten 14 gün sonrasına kadar döndürülmez. */
const SUPERVISOR_KORUMA_BITIS = KAIROS_BITIS + 14 * GUN;

const ESIK = {
  gunlukBayt: 20 * 1024 * 1024,   // D1: sunucu-konsol.log / supervisor.log bu boyutu aşınca açılışta .1'e döndürülür
  gunlukKopya: 3,                 // D1: en çok 3 eski kopya (.1 .2 .3)
  artikYasMs: 24 * SAAT,          // D2: bu yaştan eski geçici tatbikat / kuru deneme klasörü silinir
  ozDenetimBayatMs: 15 * DK,      // D10: öz denetim son yoklaması bundan eskiyse "hazır değil"
  ozDenetimIlkMs: 4 * DK,         // D10: açılıştan sonra ilk yoklama bu kadar beklenir
  kilitBayatMs: 2 * SAAT,         // D3: güncelleme kilidi bu yaştan eskiyse rapor
};

/** D2: yalnız Pusula'nın KENDİ oluşturduğu geçici klasörler (fs.mkdtempSync önek + 6 karakter). Başka hiçbir şey. */
const ARTIK_RE = /^pusula-(tatbikat|kuru)-[A-Za-z0-9]{6}$/;
/** D1: döndürülen günlükler (yalnız bu iki ad). */
const DONEN_GUNLUKLER = Object.freeze(['sunucu-konsol.log', 'supervisor.log']);

/** Saf: TR 02:30–04:30 (dahil–hariç) mı. sorunAraclari.ybPencerede ile aynı tanım. */
function yasakSaatMi(simdi = Date.now()) {
  const d = new Date(simdi), dk = d.getUTCHours() * 60 + d.getUTCMinutes();
  return dk >= 23 * 60 + 30 || dk < 90;
}
/** Saf: Kairos demo kabulü sürüyor mu. */
function kairosSuruyor(simdi = Date.now()) { return simdi < KAIROS_BITIS; }

const p2 = (n) => String(n).padStart(2, '0');
/** ms → "25.10 14:03" (TR). */
function trZaman(ms) {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms + TR);
  return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
function sureMetni(ms) {
  if (!Number.isFinite(ms)) return '—';
  const m = Math.max(0, ms);
  if (m < SAAT) return `${Math.max(1, Math.round(m / DK))} dk`;
  if (m < 2 * GUN) return `${String(Math.round(m / SAAT * 10) / 10).replace('.', ',')} saat`;
  return `${Math.round(m / GUN)} gün`;
}
const mb = (b) => `${String(Math.round(b / 1048576 * 10) / 10).replace('.', ',')} MB`;

/**
 * PUSULA'NIN BUGÜN ZATEN KENDİLİĞİNDEN YAPTIĞI ONARIMLAR (koddan; araştırma C §1) — admin dilinde, sabit liste.
 * `iz`: onarım günlüğünde görünür mü (true: olay akışı / günlük kaydından desenle bulunur).
 */
const ONARIM_TURLERI = Object.freeze([
  { kimlik: 'baglanti', ad: 'Borsaya yeniden bağlanma', ne: 'Açılışta borsaya bağlanılamazsa 1 · 2 · 5 · 10 · 30 dakika arayla (sonra 30 dakikada bir) yeniden dener; 15 dakika sürerse tek uyarı gönderir.', iz: true },
  { kimlik: 'dosya', ad: 'Bozuk kayıt dosyasını son sağlam kopyadan açma', ne: 'Ayar ya da bot dosyası bozuk okunursa son sağlam kopyadan (.yedek) açılır. Bot kaydıysa bot ENGEL\'de bekler: borsayla karşılaştırma ve açma kararı sizindir.', iz: true },
  { kimlik: 'acilis', ad: 'Pusula kapanırsa yeniden açma', ne: 'Denetleyici Pusula kapanınca yeniden açar (art arda hızlı kapanmada bekleme 10 · 30 · 60 · 300 saniyeye çıkar, 5. kapanmada Telegram). Bekçi görevi 10 dakikada bir yoklar; "Durdur" ile kapattıysanız açmaz.', iz: true },
  { kimlik: 'donma', ad: 'Donmayı çözme', ne: 'Pusula 10 dakika boyunca hiç yanıt vermezse yalnız kendi sürecini kapatır, denetleyici yeniden açar.', iz: true },
  { kimlik: 'oz-onarim', ad: 'Öz denetimin küçük onarımları', ne: 'Sahipsiz güncelleme kilidi silinir; disk azalınca 30 günden eski günlükler sıkıştırılır (silinmez); bellek şişerse sessiz saatte yeniden başlatılır. Aynı onarım günde en çok 5 kez.', iz: true },
  { kimlik: 'guvenli-kip', ad: 'Güvenli kip (koyar ve kaldırır)', ne: 'Fiyat iki kaynakta çok farklıysa, borsa bakımdaysa ya da aynı hata 30 dakikada 3 kez olursa bot yeni işlem açmaz; sebep geçince kendiliğinden çıkar. Stoplar yerinde kalır.', iz: true },
  { kimlik: 'guncelleme-geri', ad: 'Güncellemeyi geri alma', ne: 'Yeni sürüm açılamazsa ya da 8 dakikalık gözlemde sorun çıkarsa eski sürüme döner. Aynı sürüm 2 kez geri alınırsa otomatik deneme durur.', iz: true },
  { kimlik: 'stop', ad: 'Felaket stopunu yeniden koyma', ne: 'Saatlik denetimde pozisyon var ama stop yoksa kayıtlı seviyeden yeniden konur.', iz: true },
  { kimlik: 'mutabakat', ad: 'Otomatik borsa karşılaştırması', ne: 'Borsanın geçici geri çekilmesi (istek sınırı) bitince yürütücü borsayla karşılaştırır, temizse kendini açar. Elle durdurulmuş yürütücüye dokunmaz.', iz: true },
  { kimlik: 'engel-kalkti', ad: 'ENGEL\'in kendiliğinden kalkması', ne: 'Geçici sebeple konan ENGEL sebep geçince kalkar (ör. çözülen belirsizlik). Kullanıcı kararı gereken ENGEL\'ler kalkmaz.', iz: true },
  { kimlik: 'veri', ad: 'Bayat veriyi tazeleme', ne: 'Veri orkestratörü bayat kaynakları sırasıyla yeniden indirir, bayat kilidi siler; karar penceresinde ertelenir.', iz: false },
  { kimlik: 'telegram', ad: 'Telegram giden kutusu', ne: 'Gönderilemeyen ileti dosyada bekler; internet gelince ve 5 dakikada bir yeniden gönderilir.', iz: false },
  { kimlik: 'yedek', ad: 'Günlük yedek', ne: 'Her gün tarihli kopya ve SHA-256 manifesti; başarısızsa yalnız haber verir (ertesi gün yeniden alınır).', iz: false },
  { kimlik: 'doktor-dondur', ad: 'Konsol günlüğünü döndürme (Doktor D1)', ne: 'sunucu-konsol.log ya da supervisor.log 20 MB\'ı aşınca Pusula açılırken .1\'e taşınır (en çok 3 eski kopya). Dosya açıksa atlanır.', iz: true },
  { kimlik: 'doktor-temizlik', ad: 'Geçici tatbikat artığını silme (Doktor D2)', ne: 'Yarıda kalmış geri dönüş tatbikatı / kuru deneme geçici klasörleri (yalnız Pusula\'nın açtıkları, 24 saatten eski) günde bir silinir.', iz: true },
  { kimlik: 'doktor-onarim', ad: 'Doktor onarım motoru (yalnız etkin kipte)', ne: 'Hata veren bayat veri kaynağını yeniden dener, susan ileriye kayıtçıyı yeniden başlatır, Telegram ulaşmıyorsa ikinci kanala özet gönderir; açarsanız başarısız yedeği yeniden dener. Gölge kipte yalnız "şunu yapardım" der. Aynı iş 3 kez olmazsa size devreder.', iz: true },
]);

/** K1 / K2 sınırları — panelde ve kılavuzda aynı metin. */
const SINIRLAR = Object.freeze({
  yapar: [
    'Şu an ne bozuk, bunun anlamı ne, kendiliğinden düzelir mi ve sizin ne yapmanız gerektiğini tek sayfada söyler.',
    'Pusula\'nın kendiliğinden yaptığı onarımları (yeniden bağlanma, yeniden açılma, güncelleme geri alma …) tek listede toplar.',
    'İki zararsız bakım işi yapar: büyüyen konsol günlüğünü açılışta döndürür, yarıda kalmış geçici tatbikat klasörlerini günde bir siler.',
    'Onarım motoru: hata veren bayat veri kaynağını yeniden dener, susan ileriye kayıtçıyı yeniden başlatır, Telegram ulaşmıyorsa ikinci kanala (ntfy) özet gönderir; açarsanız başarısız yedeği yeniden dener. İlk 7 gün GÖLGE kipindedir: yalnız "şunu yapardım" der, hiçbir şey yapmaz. Etkin kipe yalnız siz geçirirsiniz (bu bilgisayardan, acil PIN + ONAR).',
    'Botların hazır olup olmadığını (bağlı mı, ENGEL ya da güvenli kip var mı, son karar ne zaman) gösterir.',
  ],
  yapmaz: [
    'Pozisyon açmaz, kapatmaz, küçültmez; emir vermez; acil durdurma yapmaz.',
    'ENGEL kaldırmaz, güvenli kipten çıkarmaz, "Borsayla karşılaştır" yapmaz.',
    'Ayar gevşetmez; para akışı / sapma / yatırma kabul etmez; güncelleme onaylamaz.',
    'Kod ya da ayar dosyası yazmaz, PowerShell / komut penceresi açmaz, başka program kapatmaz; Pusula\'yı yeniden başlatmaz; veri silmez.',
    'Kendi kipini değiştirmez: gölgeden etkine yalnız siz geçirirsiniz.',
    'Kairos\'a (demo kabulü, 2026-12-09\'a kadar) hiçbir şey yapmaz.',
    'İçinde serbest çalışan bir yapay zekâ ajanı yoktur — her adım önceden yazılmış ve test edilmiş bir kuraldır.',
  ],
});

// ── Kurallar: tetik (girdi) → { durum: var | yok | bilinmiyor, ayrinti, kart? } ─────────────────────────────────
/** D1: büyüyen konsol günlükleri. g.gunlukler = [{ ad, boyut (bayt) | null }] */
function d1Gunluk(g) {
  const l = Array.isArray(g.gunlukler) ? g.gunlukler : null;
  if (!l) return { durum: 'bilinmiyor', ayrinti: 'günlük boyutları okunamadı' };
  const buyuk = l.filter(x => Number.isFinite(x.boyut) && x.boyut > ESIK.gunlukBayt);
  const okunan = l.filter(x => Number.isFinite(x.boyut));
  if (!okunan.length) return { durum: 'bilinmiyor', ayrinti: 'günlük dosyası bulunamadı (Pusula denetleyicisiz açılmış olabilir)' };
  const ayrinti = okunan.map(x => `${x.ad} ${mb(x.boyut)}`).join(' · ');
  if (!buyuk.length) return { durum: 'yok', ayrinti: `${ayrinti} (sınır ${mb(ESIK.gunlukBayt)})` };
  return { durum: 'var', ayrinti, kart: {
    kimlik: 'doktor-gunluk', baslik: 'Konsol günlüğü büyüdü', ciddiyet: 'gecici',
    neOldu: `${buyuk.map(x => `${x.ad} ${mb(x.boyut)}`).join(', ')} — sınır ${mb(ESIK.gunlukBayt)}.`,
    anlami: 'Zararsız: yalnız disk yeri kullanır, botları etkilemez.',
    kendiliginden: { evet: true, metin: 'Evet — Pusula bir sonraki açılışında dosyayı .1\'e taşır (en çok 3 eski kopya kalır).' },
    yapin: ['Bir şey yapmanız gerekmez.', 'Disk doluyorsa Sağlık › Disk alanı satırına bakın.'],
    dokunmayin: 'Dosyayı Pusula çalışırken elle silmeyin ya da taşımayın.', rehber: 'doktor/bakim' } };
}
/** D2: geçici tatbikat artıkları. g.artiklar = { sayi, enEskiMs } | null */
function d2Artik(g) {
  const a = g.artiklar;
  if (!a || !Number.isFinite(a.sayi)) return { durum: 'bilinmiyor', ayrinti: 'geçici klasör okunamadı' };
  if (!a.sayi) return { durum: 'yok', ayrinti: '24 saatten eski geçici tatbikat klasörü yok' };
  return { durum: 'var', ayrinti: `${a.sayi} klasör`, kart: {
    kimlik: 'doktor-artik', baslik: 'Yarıda kalmış geçici tatbikat klasörü', ciddiyet: 'bilgi',
    neOldu: `${a.sayi} geçici klasör (geri dönüş tatbikatı / kuru deneme) 24 saatten uzun süredir duruyor.`,
    anlami: 'Zararsız: yalnız işletim sisteminin geçici klasöründe yer kaplar.',
    kendiliginden: { evet: true, metin: 'Evet — Doktor günde bir siler (TR 02:30–04:30 dışında).' },
    yapin: ['Bir şey yapmanız gerekmez.'], dokunmayin: null, rehber: 'doktor/bakim' } };
}
/** D3: bayat kilit — YALNIZ RAPOR (F1). g.kilitler = [{ ad, bayat, yasMs, sahip }] | null */
function d3Kilit(g) {
  const l = Array.isArray(g.kilitler) ? g.kilitler : null;
  if (!l) return { durum: 'bilinmiyor', ayrinti: 'kilit dosyaları okunamadı' };
  const b = l.filter(x => x && x.bayat);
  if (!b.length) return { durum: 'yok', ayrinti: l.length ? `${l.length} kilit, hepsi canlı` : 'kilit yok' };
  return { durum: 'var', ayrinti: b.map(x => x.ad).join(', '), kart: {
    kimlik: 'doktor-kilit', baslik: 'Bayat kilit dosyası', ciddiyet: 'bilgi',
    neOldu: b.map(x => `${x.ad}${Number.isFinite(x.yasMs) ? ` (${sureMetni(x.yasMs)})` : ''}${x.sahip ? ` — ${x.sahip}` : ''}`).join(' · '),
    anlami: 'Genelde zararsız: kilidin sahibi olan iş yarıda kalmış. Doktor kilidi SİLMEZ, yalnız haber verir.',
    kendiliginden: { evet: true, metin: 'Çoğu zaman evet — kilidin sahibi iş bir sonraki çalışmasında bayat kilidi kendisi siler (güncelleme kilidini öz denetim siler).' },
    yapin: ['Bekleyin; bir saat içinde kalkmazsa Sağlık › Şimdi yokla.', 'Hâlâ duruyorsa "Sohbete gönder" ile geliştirme sohbetine yazın.'],
    dokunmayin: 'Kilit dosyasını elle silmeyin — iş gerçekten sürüyorsa iki kopya aynı anda çalışır.', rehber: 'doktor/bakim' } };
}
/** D10: hazır olmama. g.hazir = hazir.hesapla() çıktısı | null; g.sorunBotlari = sorun kartı olan bot kimlikleri */
function d10Hazir(g) {
  const h = g.hazir;
  if (!h || !Array.isArray(h.botlar)) return { durum: 'bilinmiyor', ayrinti: 'hazır olma durumu okunamadı' };
  const kartli = new Set(g.sorunBotlari || []);
  const degil = h.botlar.filter(b => b.durum !== 'hazir' && b.durum !== 'durdu');
  if (!degil.length) return { durum: 'yok', ayrinti: h.botlar.length ? 'çalışan botlar hazır' : 'çalışan bot yok' };
  // Sorun merkezinin zaten kartı olan bot için ikinci kart çıkmaz (çift yapı yok).
  const yeni = degil.filter(b => !kartli.has(b.ad));
  const ayrinti = degil.map(b => `${b.adGorunen || b.ad}: ${b.metin}`).join(' · ');
  if (!yeni.length) return { durum: 'var', ayrinti };
  return { durum: 'var', ayrinti, kart: {
    kimlik: 'doktor-hazir', baslik: `Hazır olmayan bot: ${yeni.map(b => b.adGorunen || b.ad).join(', ')}`, ciddiyet: yeni.some(b => b.durum === 'bilinmiyor') ? 'dikkat' : 'gecici',
    neOldu: yeni.map(b => `${b.adGorunen || b.ad}: ${b.metin}`).join(' · '),
    anlami: 'Bot çalışıyor ama şu an karar verecek durumda değil. Pusula bunun için yeniden başlatma YAPMAZ.',
    kendiliginden: { evet: yeni.every(b => b.durum === 'bagli-degil' || b.durum === 'bekliyor'), metin: yeni.every(b => b.durum === 'bagli-degil' || b.durum === 'bekliyor') ? 'Çoğu zaman evet — bağlantı denemeleri ve otomatik borsa karşılaştırması sürüyor.' : 'Bilinmiyor — birkaç dakika sonra yeniden bakın; değişmezse Sorunlar sayfası.' },
    yapin: ['Birkaç dakika bekleyip sayfayı yenileyin.', 'Değişmezse Sistem › Sorunlar ve Sağlık sayfalarına bakın.'], dokunmayin: 'Botu durdurup başlatmayı denemeyin; önce Sorunlar sayfasını okuyun.', rehber: 'doktor/hazir' } };
}

const KURALLAR = Object.freeze([
  { kimlik: 'D1', ad: 'Konsol günlüğü döndürme', eylem: 'Pusula açılırken kendiliğinden (20 MB üstü, en çok 3 kopya)', fn: d1Gunluk },
  { kimlik: 'D2', ad: 'Geçici tatbikat artığı temizliği', eylem: 'Günde bir kendiliğinden (yalnız Pusula\'nın açtığı, 24 saatten eski klasörler)', fn: d2Artik },
  { kimlik: 'D3', ad: 'Bayat kilit', eylem: 'Yalnız rapor — Doktor silmez', fn: d3Kilit },
  { kimlik: 'D10', ad: 'Hazır olma', eylem: 'Yalnız rapor — yeniden başlatma yok', fn: d10Hazir },
]);

// ── Teşhis ──────────────────────────────────────────────────────────────────────
const CIDDIYET_SIRA = { mudahale: 0, dikkat: 1, gecici: 2, bilgi: 3 };
const CIDDIYET_AD = { mudahale: 'müdahale bekliyor', dikkat: 'dikkat', gecici: 'kendiliğinden geçecek', bilgi: 'bilgi' };
const kirp = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** Saf: Sorun merkezi kartı (lib/sorunlar.js kart()) → sade teşhis kartı. */
function sorunKartindan(k) {
  if (!k || !k.kimlik) return null;
  const ciddiyet = CIDDIYET_SIRA[k.ciddiyet] != null ? k.ciddiyet : 'dikkat';
  const g = k.gecer || {};
  const c = k.ciddi || {};
  return {
    kimlik: String(k.kimlik).slice(0, 120), kaynak: k.kaynak === 'yerel' ? 'yerel' : 'sorun', tur: k.tur || null, bot: k.bot || null, botAd: k.botAd || null,
    baslik: kirp(k.baslik, 160), ciddiyet, ciddiyetAd: CIDDIYET_AD[ciddiyet],
    neOldu: kirp(k.ne || k.baslik, 400),
    anlami: kirp([c.tonAd, c.neden].filter(Boolean).join(': '), 300) || null,
    kendiliginden: { evet: !!g.evet, metin: kirp(g.metin || (g.evet ? 'Evet' : 'Hayır'), 240), kalkis: g.kalkisMetin || null },
    yapin: (Array.isArray(k.adimlar) ? k.adimlar : []).slice(0, 5).map(a => kirp(a, 240)),
    dokunmayin: k.dokunma ? kirp(k.dokunma, 240) : null,
    rehber: k.kilavuz || null, sorunlarda: true,
  };
}
/** Saf: Doktor kuralının kartı → teşhis kartı. */
function doktorKarti(k) {
  return { kimlik: k.kimlik, kaynak: 'doktor', tur: k.kimlik, bot: null, botAd: null, baslik: k.baslik, ciddiyet: k.ciddiyet, ciddiyetAd: CIDDIYET_AD[k.ciddiyet],
    neOldu: k.neOldu, anlami: k.anlami, kendiliginden: { evet: !!k.kendiliginden.evet, metin: k.kendiliginden.metin, kalkis: null },
    yapin: k.yapin, dokunmayin: k.dokunmayin || null, rehber: `#/kilavuz/${k.rehber}`, sorunlarda: false };
}

/**
 * Saf: teşhis.
 * @param g { simdi, rol: 'sunucu'|'arastirma', sorunlar: [Sorun merkezi kartı] | null, hazir, gunlukler, artiklar, kilitler }
 * @returns { zaman, rol, ozet: { durum: iyi|dikkat|mudahale|bilinmiyor, metin, sayilar }, kartlar, kurallar: [{ kimlik, ad, eylem, durum, ayrinti }] }
 */
function teshis(g = {}) {
  const simdi = Number.isFinite(g.simdi) ? g.simdi : Date.now();
  const sorunlar = Array.isArray(g.sorunlar) ? g.sorunlar : null;
  const kartlar = (sorunlar || []).map(sorunKartindan).filter(Boolean);
  const sorunBotlari = kartlar.map(k => k.bot).filter(Boolean);
  const kurallar = KURALLAR.map(r => {
    let s;
    try { s = r.fn({ ...g, sorunBotlari }) || { durum: 'bilinmiyor', ayrinti: '' }; } catch (e) { s = { durum: 'bilinmiyor', ayrinti: `kural hesaplanamadı: ${e.message}` }; }
    if (s.kart) kartlar.push(doktorKarti(s.kart));
    return { kimlik: r.kimlik, ad: r.ad, eylem: r.eylem, durum: s.durum, ayrinti: s.ayrinti || '' };
  });
  kartlar.sort((a, b) => CIDDIYET_SIRA[a.ciddiyet] - CIDDIYET_SIRA[b.ciddiyet]);
  const say = (c) => kartlar.filter(k => k.ciddiyet === c).length;
  const sayilar = { mudahale: say('mudahale'), dikkat: say('dikkat'), gecici: say('gecici'), bilgi: say('bilgi'), toplam: kartlar.length };
  let durum, metin;
  if (sorunlar == null && g.rol !== 'arastirma') { durum = 'bilinmiyor'; metin = 'Sorun merkezi okunamadı — Doktor şu an tam teşhis koyamıyor. Sistem › Sorunlar sayfasını açın.'; }
  else if (sayilar.mudahale) { durum = 'mudahale'; metin = `Sizin bir adım atmanız gereken ${sayilar.mudahale} durum var — aşağıdaki kartın "Siz ne yapmalısınız" satırlarını izleyin.`; }
  else if (sayilar.dikkat) { durum = 'dikkat'; metin = `Acil değil ama bakmanız iyi olur: ${sayilar.dikkat} durum.`; }
  else if (sayilar.gecici || sayilar.bilgi) { durum = 'iyi'; metin = `Her şey yolunda. ${sayilar.gecici ? `${sayilar.gecici} durum kendiliğinden geçecek` : `${sayilar.bilgi} bilgi notu`} — dokunmanız gerekmez.`; }
  else { durum = 'iyi'; metin = 'Her şey yolunda — şu an bozuk bir şey yok.'; }
  if (g.rol === 'arastirma' && durum === 'iyi') metin += ' (Bu bilgisayar araştırma kopyası: botlar sunucuda çalışır.)';
  return { zaman: simdi, rol: g.rol || 'sunucu', ozet: { durum, metin, sayilar }, kartlar, kurallar };
}

module.exports = { ESIK, ARTIK_RE, DONEN_GUNLUKLER, KAIROS_BITIS, SUPERVISOR_KORUMA_BITIS, ONARIM_TURLERI, SINIRLAR, KURALLAR, CIDDIYET_AD,
  yasakSaatMi, kairosSuruyor, trZaman, sureMetni, teshis, sorunKartindan, d1Gunluk, d2Artik, d3Kilit, d10Hazir, DK, SAAT, GUN };
