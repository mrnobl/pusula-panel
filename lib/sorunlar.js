/**
 * SORUN MERKEZİ (73.7, P2 + P4) — Pusula'nın o an ETKİN sorunlarını TEK BİÇİMDE üretir. Saf modül: dosya, ağ, alt süreç YOK;
 * girdiyi server.js `sorunGirdisi()` toplar (öz denetim görüntüsü + `sorunVerisi()`, botların özeti, güncelleme, veri, Telegram,
 * ileri test izleyicisi, acil PIN, taşıma, donma, günlük sayıları; araştırma kopyasında sunucu bağlantısı ve kuyruk).
 *
 * Kullanıcı kararı (2026-10-24, taslak 4U955wGXbnq8exaMCh6hBk): "Kullanıcı boş boş ekrana bakıp endişelenmesin; Pusula sorunu
 * bulsun, yönlendirsin." Her kart aynı beş soruyu cevaplar: NE OLDU · CİDDİ Mİ (zararsız / dikkat / tehlike + neden) ·
 * KENDİLİĞİNDEN GEÇER Mİ (+ tahmini kalkış saati) · NE YAPMALI (2–5 adım) · NEYE DOKUNMAMALI. Ayrıca eylem düğmeleri (yalnız
 * mevcut uçlar + 73.8 sorun araçları — lib/sorunAraclari.js, PIN + onay, telefondan da), "Neyi saydı?" ayrıntısı, kılavuz bağlantısı, "ne zaman geliştirme sohbetine yazmalı".
 *
 * CİDDİYET (sıralama ve rozet rengi):
 *   mudahale  kırmızı — sizin kararınız / elinizle bir adım gerekiyor (bot durdu, güncelleme yarıda, Telegram gönderemiyor …)
 *   dikkat    sarı    — bakmanız iyi olur; acil değil
 *   gecici    mavi    — kendiliğinden geçecek (çoğu zaman tahmini saatiyle); dokunmayın
 *   bilgi     mavi    — yalnız bilgi
 * ASLA SESSİZ KALMAZ: kataloğa uymayan etkin durum (bilinmeyen ENGEL metni, yeni bir denetim, bilinmeyen güvenli kip kaynağı)
 * "Tanınmayan sorun — sohbete gönderin" kartı olur.
 *
 * Aynı katalog Telegram'da da kullanılır: `telegramEslestir(metin)` (alarm mesajının sonuna 2–3 kısa adım, lib/bildirimMerkezi.js)
 * ve `/teshis` komutu (`telegramTeshis`). "Sohbete gönder" paketi `teshisMetni` — sır taraması `sirTemizle` + `sizmaVarMi`.
 * Envanter: Y-01…Y-48 (botlar) ve S01…S50 (sistem), 2026-10-24.
 */
'use strict';
const H = require('./hataSozlugu');

const DK = 60000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;
const TR = 3 * SAAT;

const CIDDIYETLER = ['mudahale', 'dikkat', 'gecici', 'bilgi'];
const CIDDIYET_AD = { mudahale: 'müdahale bekliyor', dikkat: 'dikkat', gecici: 'kendiliğinden geçecek', bilgi: 'bilgi' };
const CIDDIYET_SIRA = { mudahale: 0, dikkat: 1, gecici: 2, bilgi: 3 };
const TON_AD = { zararsiz: 'Zararsız', dikkat: 'Dikkat', tehlike: 'Tehlike' };
const KLV = (id) => `#/kilavuz/sorun-giderme/${id}`;
const SOHBET_GENEL = 'Adımlar işe yaramazsa ya da durum tekrar ederse "Sohbete gönder" ile geliştirme sohbetine yazın.';
const TELEFON_NOTU = 'Telefondan izleme, acil durdurma, güncelleme ve PIN\'li sorun araçları yapılır; diğer düğmeler sunucudaki panelde.';
/** Kod hatası olduğunu düşündüren tekrar metinleri (Y-22: kendiliğinden geçmez). */
const KOD_HATASI_RE = /fiyat yok|undefined|Cannot read|is not a function|TypeError|ReferenceError|NaN|null\b/i;

// ── Zaman metinleri ───────────────────────────────────────────────────────────
const p2 = (n) => String(n).padStart(2, '0');
/** ms → "04:15" (aynı TR günü) ya da "25.10 04:15" (TR saati). */
function trSaat(ms, simdi = Date.now()) {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms + TR), s = new Date(simdi + TR);
  const hm = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  return d.toISOString().slice(0, 10) === s.toISOString().slice(0, 10) ? hm : `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)} ${hm}`;
}
function sureMetni(ms) {
  if (!Number.isFinite(ms)) return '';
  const m = Math.abs(ms);
  if (m < SAAT) return `${Math.max(1, Math.round(m / DK))} dk`;
  if (m < 2 * GUN) return `${Math.round(m / SAAT * 10) / 10 >= 10 ? Math.round(m / SAAT) : String(Math.round(m / SAAT * 10) / 10).replace('.', ',')} saat`;
  return `${Math.round(m / GUN)} gün`;
}
/** Tahmini kalkış metni: "tahmini 04:15 (~25 dk sonra)" | "kısa süre içinde" (geçmişte kaldıysa). */
function kalkisMetni(ms, simdi = Date.now()) {
  if (!Number.isFinite(ms)) return null;
  if (ms <= simdi) return 'kısa süre içinde (beklenen saat geçti — birkaç dakika içinde kalkmazsa Sağlık › Şimdi yokla)';
  return `tahmini ${trSaat(ms, simdi)} (~${sureMetni(ms - simdi)} sonra)`;
}
/** Bir sonraki TR saat:dakika anı (ms). */
function sonrakiTr(simdi, saat, dk = 0) {
  const d = new Date(simdi + TR);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), saat, dk) - TR;
  if (t <= simdi) t += GUN;
  return t;
}

// ── Eylemler (mevcut uçlar + 73.8 sorun araçları) ────────────────────────────────────────────────
/**
 * Eylem: { kimlik, ad, telefon (telefondan da yapılabilir mi), api?: { tur, bot?, eylem? }, href?, okudum? (önce "Sebebi okudum"),
 *          yakinda? (yer tutucu — düğme kapalı), not? }. Panel `api.tur`u AG.api'deki mevcut çağrıya eşler (js/pages/sorunlar.js).
 */
const EY = {
  mutabakat: (bot) => ({ kimlik: 'mutabakat', ad: 'Borsayla karşılaştır', api: { tur: 'bindirmeEylem', bot, eylem: 'mutabakat' }, telefon: false }),
  engelKaldir: (bot, ad) => ({ kimlik: 'engel-kaldir', ad: ad || 'Botu yeniden aç', api: { tur: 'bindirmeEylem', bot, eylem: 'engel-kaldir' }, okudum: true, telefon: false }),
  gkKaldir: (bot) => ({ kimlik: 'gk-kaldir', ad: 'Güvenli kipi kaldır', api: { tur: 'guvenliKipKaldir', bot }, okudum: true, telefon: false }),
  yokla: () => ({ kimlik: 'yokla', ad: 'Şimdi yokla', api: { tur: 'yokla' }, telefon: true }),   // 77.x: telefondan PIN'siz, dakikada 1 (sunucu sınırlar)
  acil: (bot) => ({ kimlik: 'acil', ad: 'Acil durdur…', acil: bot, telefon: true }),
  git: (ad, href, telefon = true) => ({ kimlik: `git:${href}`, ad, href, telefon }),
  yakinda: (ad) => ({ kimlik: `yakinda:${ad}`, ad, yakinda: true, telefon: false, not: 'Bu araç henüz yok — şimdilik adımlardaki yolu izleyin.' }),
  /**
   * 73.8 SORUN ARACI (lib/sorunAraclari.js): önce önizleme, sonra acil PIN + onay metni. Telefondan da (kullanıcı kararı 2026-10-24);
   * araştırma kopyasında sunucuya iletilir. Panel `api.tur === 'sorunArac'` → GET …/onizle, POST …/uygula.
   */
  arac: (arac, bot, ad, sembol = null) => ({ kimlik: `arac:${arac}${sembol ? ':' + sembol : ''}`, ad, api: { tur: 'sorunArac', arac, bot, sembol }, arac: true, telefon: true }),
  /**
   * 77.x (kullanıcı 2026-10-26: "sunucuya ulaşamama durumunda tek imkanımız telefon"): güvenli kipten çıkış — önizleme + acil PIN + KALDIR.
   * `yalnizUzak`: sunucudaki masaüstü panelde gizli (orada "Güvenli kipi kaldır" + "Sebebi okudum" yolu aynen); telefonda ve araştırma
   * kopyasında görünür.
   */
  gkCik: (bot) => ({ ...EY.arac('guvenli-kip-kaldir', bot, 'Güvenli kipten çık (PIN)…'), yalnizUzak: true }),
  /** 77.x: "Borsayla karşılaştır" — masaüstünde mevcut uç; telefonda PIN + KARŞILAŞTIR aracı (yalnizTelefon: yalnız telefonda görünür). */
  mutabakatlar: (bot) => [EY.mutabakat(bot), { ...EY.arac('borsa-karsilastir', bot, 'Borsayla karşılaştır (PIN)…'), yalnizTelefon: true }],
};
const botSayfasi = (bot, alt) => EY.git('Bot sayfası', `#/botlar/${bot}${alt ? '/' + alt : ''}`);

/**
 * KATALOG — durum türü → sabit metinler. `kisa`: Telegram ve /teshis için 2–3 kısa adım. `telegram`: alarm mesajını bu türe
 * bağlayan desen (başlık + gövde düz metni). `envanter`: kapsanan envanter maddeleri. Metinler sade Türkçe; dinamik kısım (ne oldu,
 * kalkış saati, neyi saydı) üretimde eklenir.
 */
const KATALOG = {
  // ═══ BOT DURDU (ENGEL — tam kapanma) ═══
  'bot-emir-reddi': {
    baslik: '{bot} durdu: emirler borsada reddedildi', ciddiyet: 'mudahale', envanter: ['Y-01', 'Y-07', 'Y-08', 'Y-11'], kilavuz: 'emir-reddi',
    ciddi: { ton: 'dikkat', neden: 'Borsa emirleri gerçek bir sebeple (teminat, bakiye ya da kurala uymayan istek) reddetti. Açık pozisyonlar ve borsadaki stoplar yerinde.' },
    gecer: { evet: false, metin: 'Hayır — sizin onayınızı bekliyor.' },
    adimlar: ['"Neyi saydı?" bölümündeki ret kodlarına ve açıklamalarına bakın.', 'Kod -2019 / -2010 (teminat / bakiye): Binance\'te elle çekim ya da işlem yaptıysanız sebep budur; Botlar › Hesap görünümünde teminatı kontrol edin.', 'Açıklamada "kod hatası" (-1111, -1100, -4015 …) yazıyorsa botu AÇMAYIN — "Sohbete gönder" ile geliştirme sohbetine iletin.', 'Sebebi giderdiyseniz "Borsayla karşılaştır" → temiz çıkarsa "Sebebi okudum" → "Botu yeniden aç". Sayaçlar açtığınız an sıfırlanır.'],
    kisa: ['Sağlık › bot kartında ret kodunu okuyun (teminat / bakiye mi, kod hatası mı).', 'Kod hatasıysa botu açmayın, geliştirme sohbetine yazın; değilse sebebi giderip "Botu yeniden aç".'],
    dokunma: 'Binance\'te pozisyonları aceleyle kapatmayın — stoplar borsada duruyor.',
    sohbet: 'Kod hatası sınıfında ret varsa ya da açtıktan sonra bot yeniden kapanırsa.',
    telegram: /(TAMAMEN|YENİDEN) KAPANDI[\s\S]*emirleri? .*reddetti|emirleri? 30 dk'da \d+ kez reddetti/i,
  },
  'bot-stop-kurulamadi': {
    baslik: '{bot} durdu: koruma stopu kurulamıyor', ciddiyet: 'mudahale', envanter: ['Y-12'], kilavuz: 'stop-kurulamadi',
    ciddi: { ton: 'tehlike', neden: 'Açık pozisyonun felaket stopu art arda 3 denetimde borsaya konamadı; pozisyon korumasız olabilir.' },
    gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Binance › Açık emirler › Koşullu emirler: bu coinde STOP_MARKET (kapatma) emri var mı bakın.', 'Hata -2021 ise fiyat zaten stop seviyesinin ötesinde: pozisyonu Binance\'te kendiniz değerlendirin (bot kapatmaz).', 'Hata -4130 ise borsada başka bir kapatma stopu var (elle konmuş olabilir): fazlasını silin.', 'Başka bir hata ya da emin değilseniz: "Sohbete gönder" ile geliştirme sohbetine yazın.'],
    kisa: ['Binance › Koşullu emirler\'de bu coinin stopu var mı bakın.', 'Yoksa ya da hata kodu -2021 ise pozisyonu kendiniz değerlendirin; geliştirme sohbetine yazın.'],
    dokunma: null, sohbet: 'Her zaman — bu durum kendiliğinden düzelmez.',
    telegram: /koruma stopu art arda|Koruma stopu konamadı|felaket stopu konamadı|Felaket stopu KONAMADI/i,
  },
  'bot-dongu-coktu': {
    baslik: '{bot} durdu: bot döngüsü tekrar tekrar hata verdi', ciddiyet: 'mudahale', envanter: ['Y-13'], kilavuz: 'dongu-coktu',
    ciddi: { ton: 'dikkat', neden: 'Dakikalık bot döngüsü 30 dakikada 3 kez hata verdi; çoğu zaman kod ya da kalıcı okuma sorunu.' },
    gecer: { evet: false, metin: 'Hayır — sizin onayınızı bekliyor.' },
    adimlar: ['"Neyi saydı?" bölümündeki son hataları okuyun.', '"fiyat yok / undefined / Cannot read" gibi bir kod hatasıysa botu AÇMAYIN — geliştirme sohbetine yazın.', '"veri kapısı" yazıyorsa borsa verisi bozuk: 1 saat bekleyip "Botu yeniden aç".'],
    kisa: ['Sağlık › bot kartında son hatayı okuyun.', 'Kod hatasıysa açmayın, geliştirme sohbetine yazın.'],
    dokunma: null, sohbet: 'Hata metni bir kod hatasına benziyorsa hemen.', telegram: /bot döngüsü 30 dk'da \d+ kez hata/i,
  },
  'bot-emir-freni': {
    baslik: '{bot} durdu: emir freni', ciddiyet: 'mudahale', envanter: ['Y-14'], kilavuz: 'emir-freni',
    ciddi: { ton: 'dikkat', neden: 'Kısa sürede beklenmeyen kadar çok emir gönderildi (kaçak döngü olabilir). Azaltan emirler ve stoplar serbest.' },
    gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['"Neyi saydı?" dökümünde fren sebebine ve son 24 saatin emirlerine (coin / kol başına) bakın.', 'Aynı coinde onlarca emir varsa botu AÇMAYIN — Acil durdur ve geliştirme sohbetine yazın.', 'Tek seferlik büyük bir merdiven gibi açıklanabilir bir sebepse "Botu yeniden aç" (fren de kalkar).'],
    kisa: ['Botlar › İşlemler\'de aynı coinde çok sayıda emir var mı bakın.', 'Varsa açmayın, geliştirme sohbetine yazın.'],
    dokunma: null, sohbet: 'Sebebi açıklanamıyorsa.', telegram: /EMİR FRENİ/,
  },
  'bot-durum-dosyasi': {
    baslik: '{bot} durdu: durum dosyası bozuk açıldı', ciddiyet: 'mudahale', envanter: ['Y-15', 'S34'], kilavuz: 'durum-dosyasi',
    ciddi: { ton: 'dikkat', neden: 'Botun kayıt dosyası bozuk açıldı (elektrik kesintisi, disk). Son sağlam kopyadan açıldı; borsayla karşılaştırılana kadar kapalı.' },
    gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['"Borsayla karşılaştır" deyin.', 'Temiz çıkarsa "Sebebi okudum" → "Botu yeniden aç".', 'Uyuşmazlık çıkarsa "pozisyon uyuşmazlığı" kartındaki adımları izleyin.'],
    kisa: ['Panelde "Borsayla karşılaştır".', 'Temizse "Botu yeniden aç".'], dokunma: null, sohbet: 'Karşılaştırma temiz çıkmazsa.', telegram: /durum dosyası bozuk/i,
  },
  'bot-uygulama-sapmasi': {
    baslik: '{bot} durdu: gerçek sonuç simülasyondan %5\'ten fazla ayrıldı', ciddiyet: 'mudahale', envanter: ['Y-05'], kilavuz: 'uygulama-sapmasi',
    ciddi: { ton: 'dikkat', neden: 'Para kaybı demek değil; 30 günde gerçek ile ideal arasında 5 puandan fazla fark birikti (kaçırılan gün, kayma, funding).' },
    gecer: { evet: false, metin: 'Hayır — "Engeli kaldır" tek başına yetmez (30 günlük pencere değişmediği için aynı gün yeniden gelir); "Farkı kabul et" kalıcı çözer.' },
    adimlar: ['"Farkı kabul et" önizlemesindeki dökümde farkın hangi günlerden geldiğine bakın: tek bir güne mi yığılmış (kaçırılan gün / telafi), her güne mi yayılmış?', 'Tek güne yığılmış ve sebebi biliniyorsa "Farkı kabul et" (PIN + KABUL): o günler banda sayılmaz (kayıt silinmez), ENGEL kalkar ve aynı farkla yeniden gelmez.', 'Her gün küçük fark varsa (kayma / funding) kabul etmeden önce geliştirme sohbetine yazın.'],
    kisa: ['Panel › Sorunlar › "Farkı kabul et" önizlemesinde farkın günlerine bakın.', 'Tek güne yığılmışsa kabul edin (PIN + KABUL); her güne yayılmışsa geliştirme sohbetine yazın.'],
    dokunma: '"Engeli kaldır"a tekrar tekrar basmayın — aynı gün yeniden gelir.', sohbet: 'Fark her güne yayılmışsa.', telegram: /uygulama sapması: 30 g|ENGEL — uygulama sapması|yeni emir vermiyor[\s\S]*simülasyondan/i,
    ekEylem: (bot) => [EY.arac('sapma-kabul', bot, 'Farkı kabul et…')],
  },
  'bot-hesap-kesicisi': {
    baslik: '{bot} durdu: hesap kesicisi (zarar sınırı) — her şey kapatıldı', ciddiyet: 'mudahale', envanter: ['Y-18'], kilavuz: 'hesap-kesicisi',
    ciddi: { ton: 'tehlike', neden: 'Başlangıçtan kayıp sınırına ulaşıldı; bot acil durdurma ile pozisyonları kapattı.' },
    gecer: { evet: false, metin: 'Hayır — yeniden açmak yeni bir para kararıdır.' },
    adimlar: ['Önce İleri test ekranında kaybın modelle uyumlu olup olmadığına bakın.', 'Binance\'te pozisyonların kapandığını doğrulayın.', 'Yeniden açmadan önce geliştirme sohbetinde değerlendirin.'],
    kisa: ['Binance\'te pozisyonların kapandığını doğrulayın.', 'Yeniden açmadan önce geliştirme sohbetinde değerlendirin.'], dokunma: null, sohbet: 'Her zaman.', telegram: /hesap kesicisi/i,
  },
  'bot-kol-uyusmazlik': {
    baslik: '{bot} durdu: borsadaki pozisyonlar botun kayıtlarıyla uyuşmuyor', ciddiyet: 'mudahale', envanter: ['Y-09', 'Y-09b'], kilavuz: 'pozisyon-uyusmazligi',
    ciddi: { ton: 'dikkat', neden: 'Elle işlem, gecikmeli dolum, ADL / likidasyon ya da stop tetiklenmesi olabilir. Bot yeni emir vermiyor.' },
    gecer: { evet: false, metin: 'Borsayla karşılaştırma temiz çıkınca kendisi açılır ("Engeli kaldır" bu durumu çözmez).' },
    adimlar: ['"Neyi saydı?" tablosunda coin başına farka ve "Olası neden" sütununa bakın (son emirler, son dolum, stop / ADL olayı).', 'Gecikmeli dolum (yeni / açık emir): 2 dakika bekleyip "Borsayla karşılaştır".', 'Binance\'te elle işlem yaptıysanız o işlemi geri alın, sonra "Borsayla karşılaştır".', 'Stop / ADL / likidasyon pozisyonu kapattıysa: o coin için "Kaydı borsaya eşitle" (PIN + ESITLE), sonra "Borsayla karşılaştır".', 'Hiçbiri değilse "Sohbete gönder".'],
    kisa: ['Panelde "Borsayla karşılaştır" (gecikmeli dolumsa temiz çıkar).', 'Stop / ADL kapattıysa "Kaydı borsaya eşitle"; elle işlemse geri alın; değilse geliştirme sohbetine yazın.'],
    dokunma: '"Engeli kaldır"a basmayın — bu engeli yalnız temiz karşılaştırma kaldırır.', sohbet: 'Karşılaştırma iki kez temiz çıkmazsa.', telegram: /pozisyon uyuşmazlığı|kayıt borsayla uyuşmuyor|Bot kaydı ile borsa uyuşmuyor|mutabakat uyuşmazlığı/i,
  },
  'bot-felaket-stopu': {
    baslik: '{bot}: felaket stopu çalıştı, kayıtlar borsayla uyuşmuyor', ciddiyet: 'mudahale', envanter: ['Y-03'], kilavuz: 'felaket-stopu',
    ciddi: { ton: 'dikkat', neden: 'Koruma çalıştı: pozisyon borsada kapandı, zarar sınırlandı. Ama botun defteri pozisyonu hâlâ açık sanıyor.' },
    gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Panik satış yapmayın — stop zaten zararı sınırladı.', 'Binance\'te o coinde pozisyon kaldı mı bakın.', '"Kaydı borsaya eşitle" (o coin) önizlemesini okuyun: borsa / kayıt / fark / ne değişecek. Emir gönderilmez.', 'Doğruysa PIN + ESITLE ile uygulayın, sonra "Borsayla karşılaştır" — temiz çıkınca kol engeli kalkar.'],
    kisa: ['Binance\'te o coinde pozisyon kaldı mı bakın.', 'Panel › Sorunlar › "Kaydı borsaya eşitle" (PIN + ESITLE), sonra "Borsayla karşılaştır".'],
    dokunma: '"Acil fren"e basmayın — kalan HER ŞEYİ kapatır.', sohbet: 'Eşitleme aracı "uygulanamaz" derse.', telegram: /felaket stopu tetiklendi|Koruma stopu çalıştı/i,
  },
  'bot-coklu-varlik': {
    baslik: '{bot} durdu: çoklu varlık (BTC teminat) denetimi', ciddiyet: 'mudahale', envanter: ['Y-43'], kilavuz: 'coklu-varlik',
    ciddi: { ton: 'dikkat', neden: 'Spot / vadeli cüzdanda botun beklemediği bir bakiye ya da kip var (elle aktarım, yatırma, satış).' },
    gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Sebep metnini okuyun: "botun olmayan bakiye" ise o para sizin yatırmanızsa "Yatırmayı kabul et" bunu kabul eder.', '"çoklu varlık modu KAPALI" ise Binance › Vadeli › Ayarlar\'da çoklu varlık modunu açın.', '"vadeli BTC ≠ beklenen" ise elle aktarım / satış yaptıysanız geri alın; değilse geliştirme sohbetine yazın.'],
    kisa: ['Sağlık › bot kartında sebebi okuyun (yatırma mı, kip mi, aktarım mı).', 'Kendi işleminizse kabul edin; değilse geliştirme sohbetine yazın.'],
    dokunma: null, sohbet: 'Sebebi bilmiyorsanız.', telegram: /çoklu varlık|botun olmayan bakiye|çözülmemiş belirsiz akış/i,
    /** 73.8 (Y-43): alt tür → 2–3 adım ve doğru düğme (uret içinde `cokluAltTur`). */
    altTurler: {
      'mod-kapali': { ad: 'çoklu varlık modu kapalı', adimlar: ['Binance › Vadeli (USDⓈ-M) › Ayarlar › Asset Mode / Çoklu varlık modunu AÇIN (canlıda Pusula kendisi açmaz).', 'Sonra "Borsayla karşılaştır": temiz çıkınca bot bir sonraki çalışmada sürer.', 'Mod açılmıyorsa (açık pozisyon / bakiye uyarısı) geliştirme sohbetine yazın.'] },
      'yabanci-bakiye': { ad: 'spot cüzdanda botun bilmediği bakiye', adimlar: ['Spot cüzdana siz mi para yatırdınız ya da aktardınız? Evet → "Yatırmayı kabul et" (PIN + KABUL): bakiye botun sayılır.', 'Hayır → o bakiyeyi spot cüzdandan başka bir hesaba taşıyın (adanmış hesap şartı), sonra "Borsayla karşılaştır".', 'Emin değilseniz geliştirme sohbetine yazın.'] },
      'vadeli-fark': { ad: 'vadeli cüzdandaki BTC beklenenden farklı', adimlar: ['Binance\'te elle BTC aktardınız ya da sattınız mı? Evet → geri alın ya da "Engeli kaldır (kendi işlemimdi)" — borsadaki miktar yeni taban olur.', 'USDT eksiye düştüyse Binance otomatik çevirmiş olabilir: geliştirme sohbetine yazın.', 'Sonra "Borsayla karşılaştır".'] },
      'belirsiz-akis': { ad: 'sonucu belirsiz aktarım / alım', adimlar: ['"Borsayla karşılaştır" deyin — Pusula belirsiz adımı borsaya sorup çözmeyi dener.', 'İki denemede çözülmezse Binance › Cüzdan geçmişinde son aktarımı kontrol edip geliştirme sohbetine yazın.'] },
      'okunamadi': { ad: 'çoklu varlık okunamadı', adimlar: ['İnterneti ve Binance bağlantısını kontrol edin; birkaç dakika sonra "Borsayla karşılaştır".', 'Sürerse Ayarlar › Anahtarlar › "Sına".'] },
    },
  },
  'bot-yatirma-kabul': {
    baslik: '{bot}: spot cüzdana para yatırıldı — kabulünüzü bekliyor', ciddiyet: 'dikkat', envanter: ['Y-44'], kilavuz: 'yatirma-kabul',
    ciddi: { ton: 'zararsiz', neden: 'Hesaba yeni para geldi; bot bunun sizin yatırmanız olduğunu onaylamanızı bekliyor.' },
    gecer: { evet: false, metin: 'Hayır — onay bekliyor.' },
    adimlar: ['Yatırmayı siz yaptıysanız "Yatırmayı kabul et" önizlemesini okuyun, PIN + KABUL ile onaylayın (engel ve emir freni bundan etkilenmez).', 'Siz yapmadıysanız Binance hesabınızı kontrol edin ve geliştirme sohbetine yazın.'],
    kisa: ['Yatırma sizinse Panel › Sorunlar › "Yatırmayı kabul et" (PIN + KABUL; telefondan da olur).'], dokunma: null, sohbet: 'Yatırmayı siz yapmadıysanız.', telegram: /para yatırıldı[\s\S]*kabul bekliyor/i,
  },
  // Para akışı onayı (kullanıcı kuralı 2026-10-25; lib/live/paraAkisi.js): onaysız çıkış botu durdurur, onaysız giriş hesaba katılmaz.
  'bot-para-cikisi': {
    baslik: '{bot}: onaysız para çıkışı — bot durdu', ciddiyet: 'mudahale', envanter: [], kilavuz: 'para-akisi-onay',
    ciddi: { ton: 'dikkat', neden: 'Borsadaki hesaptan para çıktı ve bunu sizin yaptığınıza dair kayıt yok. Bot yeni işlem açmıyor; açık pozisyonların stopu yerinde.' },
    gecer: { evet: false, metin: 'Hayır — onayınızı bekliyor.' },
    adimlar: ['Parayı siz çektiyseniz "Para hareketini onayla" önizlemesini okuyun, PIN + ONAY ile onaylayın: bot yeni bakiyeyle sürer.', 'Siz çekmediyseniz ONAYLAMAYIN: Binance hesabınızı kontrol edin, API anahtarlarını yenileyin, geliştirme sohbetine yazın.', 'Bir dahaki çekimden önce bot sayfasında "Para yatırdım / çektim" ile kaydederseniz bot durmaz.'],
    kisa: ['Çekim sizinse Panel › Sorunlar › "Para hareketini onayla" (PIN + ONAY; telefondan da olur).', 'Siz değilseniz "Bu ben değilim — reddet" (PIN + BEN DEĞİLİM): bot durmuş kalır, güvenlik alarmı gider.'], dokunma: 'Çekimi siz yapmadıysanız onaylamayın.', sohbet: 'Çekimi siz yapmadıysanız hemen.', telegram: /onaysız para çıkışı/i,
  },
  // 76.4 "Bu ben değilim" (kullanıcı onayı 2026-10-25): reddedilen çıkış — bot durmuş kalır, kırmızı kart kalır, yalnız bilinçli onayla sürer.
  'bot-para-reddedildi': {
    baslik: '{bot}: sizin yapmadığınız para çıkışı — bot durdu (güvenlik)', ciddiyet: 'mudahale', envanter: [], kilavuz: 'para-akisi-onay',
    ciddi: { ton: 'tehlike', neden: 'Hesaptan çıkan parayı siz yapmadığınızı söylediniz: hesabınıza ya da API anahtarınıza başkası erişmiş olabilir. Bot yeni işlem açmıyor; açık pozisyonların stopu yerinde.' },
    gecer: { evet: false, metin: 'Hayır — bot siz bilinçli olarak onaylayana kadar durmuş kalır.' },
    adimlar: ['Borsaya girin: şifreyi ve iki adımlı doğrulamayı değiştirin, para çekme geçmişine ve oturumlara bakın.', 'Borsadaki API anahtarlarını silip yenileyin; yenisini Ayarlar › Anahtarlar\'a girin.', 'Geliştirme sohbetine yazın ("Sohbete gönder").', 'Hareketin sonradan sizin olduğunu anlarsanız "Hareket benimmiş — onayla" (PIN + ONAY): bot ancak o zaman yeni bakiyeyle sürer.'],
    kisa: ['Borsa şifresi + iki adımlı doğrulama + API anahtarlarını hemen yenileyin.', 'Hareket sizinse bilinçli olarak Panel › Sorunlar › "Hareket benimmiş — onayla" (PIN + ONAY).'], dokunma: 'Hesabı güvene almadan botu onaylayıp açmayın.', sohbet: 'Hemen.', telegram: /sizin yapmadığınız para çıkışı/i,
  },
  'bot-para-girisi': {
    baslik: '{bot}: para girişi onayınızı bekliyor', ciddiyet: 'dikkat', envanter: [], kilavuz: 'para-akisi-onay',
    ciddi: { ton: 'zararsiz', neden: 'Hesaba para geldi. Bot durmadı ama bu parayı onaylayana kadar hesaba katmıyor (eski bakiyeyle çalışıyor).' },
    gecer: { evet: false, metin: 'Hayır — onayınızı bekliyor.' },
    adimlar: ['Parayı siz yatırdıysanız "Para hareketini onayla" önizlemesini okuyun, PIN + ONAY ile onaylayın: sermaye tavanı ve pozisyon boyutu yeni bakiyeye göre hesaplanır.', 'Siz yatırmadıysanız Binance hesabınızı kontrol edin ve geliştirme sohbetine yazın.'],
    kisa: ['Yatırma sizinse Panel › Sorunlar › "Para hareketini onayla" (PIN + ONAY; telefondan da olur).'], dokunma: null, sohbet: 'Yatırmayı siz yapmadıysanız.', telegram: /para girişi (algılandı[\s\S]*)?onayınızı bekliyor/i,
  },
  'bot-ileri-dur': {
    baslik: '{bot}: modelin düşüş sınırı aşıldı (ileri test DUR)', ciddiyet: 'dikkat', envanter: ['Y-19'], kilavuz: 'ileri-dur',
    ciddi: { ton: 'dikkat', neden: 'Modelin ileri dönemdeki düşüşü simülasyonun %99 sınırını geçti; model artık beklendiği gibi davranmıyor olabilir.' },
    gecer: { evet: false, metin: 'Hayır — karar sizin.' },
    adimlar: ['İleri test › Kairos / Tao\'da "en derin düşüş" satırına bakın: uyarı mı alarm mı?', 'Alarmda model geçersiz sayılır: botu Durdur (acil değil) ve geliştirme sohbetinde değerlendirin.'],
    kisa: ['İleri test sayfasına bakın.', 'Alarmsa botu durdurup geliştirme sohbetinde değerlendirin.'], dokunma: null, sohbet: 'Alarm seviyesindeyse.', telegram: /ileri veri: DUR|durdurma sinyali/i,
  },
  'bot-kapi': {
    baslik: '{bot}: canlı hesap kapısı kapandı — günlük çalışma yapılmadı', ciddiyet: 'mudahale', envanter: ['Y-39'], kilavuz: 'gercek-para-kapisi',
    ciddi: { ton: 'dikkat', neden: 'Canlı hesap şartlarından biri (onay, tavan, anahtar, sağlık sinyali …) eksik; risk artıran emir verilmiyor.' },
    gecer: { evet: false, metin: 'Hayır — eksik şart tamamlanınca bir sonraki çalışmada sürer.' },
    adimlar: ['Sebep metnindeki eksik şartları okuyun.', 'Ayarlar › Botlar › Canlı hesap bölümünde eksik onayı tamamlayın.'],
    kisa: ['Ayarlar › Botlar\'da eksik canlı hesap şartını tamamlayın.'], dokunma: null, sohbet: 'Hangi şartın eksik olduğu anlaşılmıyorsa.', telegram: /gerçek para kapısı KAPANDI/i,
  },

  // ═══ GÜVENLİ KİP (yeni işlem yok; çoğu kendiliğinden geçer) ═══
  'gk-bakim': {
    baslik: '{bot} güvenli kipte: Binance bakımı', ciddiyet: 'gecici', envanter: ['Y-23', 'Y-06'], kilavuz: 'guvenli-kip',
    ciddi: { ton: 'zararsiz', neden: 'Koruma amaçlı: bakım sırasında yeni işlem açılmıyor. Açık pozisyonların stopu borsada duruyor.' },
    gecer: { evet: true, metin: 'Evet — bakım bittikten 15 dk sonra. Kaçan çalışma sonra yapılır; "geçti" iletisi gelir.' },
    adimlar: ['Dokunmayın; bakım bitince kendiliğinden kalkar.'], kisa: ['Dokunmayın; bakım bitince 15 dk sonra kendiliğinden kalkar.'],
    dokunma: 'Güvenli kipi elle kaldırmayın; bu sırada Telegram\'a kırmızı alarm gitmez, healthchecks "çalışmadı" demez.', sohbet: 'Bakım bittikten 1 saat sonra hâlâ sürüyorsa.',
    telegram: /güvenli kipte[\s\S]*Binance bakımı|Binance bakımı[\s\S]*güvenli kip/i,
  },
  'gk-fiyat': {
    baslik: '{bot} güvenli kipte: fiyat kaynakları birbirini tutmuyor', ciddiyet: 'gecici', envanter: ['Y-24'], kilavuz: 'guvenli-kip',
    ciddi: { ton: 'zararsiz', neden: 'Binance fiyatı ikinci kaynaktan %3\'ten fazla farklı; bozuk veriyle işlem açılmasın diye bekleniyor.' },
    gecer: { evet: true, metin: 'Evet — fark %1\'in altına inince (5 dakikada bir bakılır).' },
    adimlar: ['Dokunmayın; fiyatlar yeniden uyuşunca kendiliğinden kalkar.'], kisa: ['Dokunmayın; fiyat farkı %1\'in altına inince kalkar.'],
    dokunma: 'Güvenli kipi elle kaldırmayın.', sohbet: '2 saatten uzun sürerse.', telegram: /güvenli kipte[\s\S]*fiyat iki kaynakta|fiyat iki kaynakta[\s\S]*farklı/i,
  },
  // 74.3 D4 — veri kalitesi kapısı (lib/live/veriKalitesi.js): yalnız ETKİN kipte botun kendisi koyar, veri temizlenince kendisi kaldırır
  'gk-veri': {
    baslik: '{bot} güvenli kipte: karar verisi şüpheli (veri kalitesi)', ciddiyet: 'gecici', envanter: [], kilavuz: 'veri-kalitesi',
    ciddi: { ton: 'zararsiz', neden: 'Günlük kararın girdilerinden biri (iki kaynak kapanış farkı, mark fiyatı ya da hesap) bozuk görünüyor; bozuk veriyle işlem açılmasın diye karar ertelendi. Açık pozisyonların stopu borsada.' },
    gecer: { evet: true, metin: 'Evet — bot 15 dakikada bir yeniden denetler; veri temizlenince kalkar ve "geçti" iletisi gelir.' },
    adimlar: ['Dokunmayın: yeni işlem açılmıyor, açık pozisyonların stopu borsada duruyor.', '"Ne oldu" satırında hangi denetimin ne bulduğunu okuyun (ör. vadeli ile spot kapanışı %3\'ten fazla farklı).', 'Binance\'te BTC grafiğine bakın: gerçekten olağan dışı bir hareket ya da borsa sorunu varsa beklemek doğrudur.', '2 saatten uzun sürer ve Binance\'te her şey normal görünürse Sağlık › Veri kalitesi\'nden "İzleme kipine dön" deyin (güvenli kip hemen kalkar), sonra "Sohbete gönder" ile geliştirme sohbetine yazın — eşik ayarı gerekebilir.'],
    kisa: ['Dokunmayın; veri temizlenince kendiliğinden kalkar.', '2 saatten uzun sürerse Sağlık › Veri kalitesi\'nden izleme kipine dönün ve geliştirme sohbetine yazın.'],
    dokunma: 'Binance\'te pozisyonları aceleyle kapatmayın — stoplar borsada.', sohbet: '2 saatten uzun sürerse ya da aynı bulgu her gün geliyorsa.', telegram: /güvenli kipte[\s\S]*veri kalitesi|veri kalitesi:/i,
  },
  'veri-kalitesi': {
    baslik: '{bot}: veri kalitesi bulgusu', ciddiyet: 'gecici', envanter: [], kilavuz: 'veri-kalitesi',
    ciddi: { ton: 'zararsiz', neden: 'Günlük kararın girdilerinde bir tutarsızlık kaydedildi. İzleme kipinde bot kararını DEĞİŞTİRMEZ; yalnız size gösterilir.' },
    gecer: { evet: true, metin: 'Çoğu zaman — bir sonraki günlük çalışma temiz çıkarsa kart kaybolur.' },
    adimlar: ['"Ne oldu" satırını okuyun: hangi denetim (iki kaynak farkı, mark fiyatı, hesap, coin evreni, kol mumları) ne buldu.', '"hafif" bulgu (ör. ikinci kaynak okunamadı) genellikle geçicidir — dokunmayın, yarın kendiliğinden kaybolur.', '"AĞIR" bulgu birkaç gün üst üste geliyorsa ya da Binance\'te fiyatlar normal görünüyorsa "Sohbete gönder" ile geliştirme sohbetine yazın (yanlış alarm olabilir, eşik ayarlanır).', 'İzleme 7 günü doldurduysa Sağlık › Veri kalitesi kartındaki bulgu sayılarına bakıp etkin kipe geçmeye siz karar verin — Pusula kendiliğinden geçmez.'],
    kisa: ['Ne bulunduğunu okuyun; hafif bulgu çoğu zaman yarın geçer.', 'Ağır bulgu üst üste geliyorsa geliştirme sohbetine yazın.'],
    dokunma: 'Bulguya bakarak botu durdurmayın — izleme kipinde karar zaten aynen sürüyor.', sohbet: 'Ağır bulgu birkaç gün üst üste gelirse.', telegram: /Öz denetim: Veri kalitesi|veri kalitesi (AĞIR|hafif)/i,
  },
  'gk-stop-vurus': {
    baslik: '{bot} güvenli kipte: 24 saatte 2 felaket stopu', ciddiyet: 'gecici', envanter: ['Y-25'], kilavuz: 'guvenli-kip',
    ciddi: { ton: 'dikkat', neden: 'Piyasa anormal oynak; 24 saat yeni işlem açılmıyor. Kalan pozisyonların stopu yerinde.' },
    gecer: { evet: true, metin: 'Evet — son stop vuruşundan 24 saat sonra.' },
    adimlar: ['Dokunmayın; 24 saat dolunca kendiliğinden kalkar.', 'Binance\'te kalan pozisyonların stoplarını görmek isterseniz Botlar › Hesap.'], kisa: ['Dokunmayın; son stop vuruşundan 24 saat sonra kalkar.'],
    dokunma: 'Güvenli kipi elle kaldırmayın.', sohbet: 'Stoplardan biri kayıt uyuşmazlığına yol açtıysa.', telegram: /24 saatte \d+ felaket stopu/i,
  },
  // 77.x: kullanıcı "Güvenli kipe al" aracıyla (acil PIN + GÜVENLİ; telefondan da) koydu — kendiliğinden KALKMAZ
  'gk-elle': {
    baslik: '{bot} güvenli kipte: elle alındı', ciddiyet: 'dikkat', envanter: [], kilavuz: 'guvenli-kip',
    ciddi: { ton: 'zararsiz', neden: 'Bot "Güvenli kipe al" aracıyla güvenli kipe alındı: yeni işlem açılmıyor, açık pozisyonların stopu borsada, dakikalık koruma sürüyor.' },
    gecer: { evet: false, metin: 'Hayır — siz kaldırana kadar sürer.' },
    adimlar: ['Sebep geçtiyse "Güvenli kipten çık" (acil PIN + KALDIR; telefondan da) ya da sunucudaki panelde "Güvenli kipi kaldır".', 'Bunu siz yapmadıysanız: botu böyle bırakın, acil PIN\'i değiştirin (Ayarlar › Anahtarlar) ve Telegram\'daki "kullanıcı aracı" iletisine bakın.'],
    kisa: ['Sebep geçtiyse Panel › Sorunlar › "Güvenli kipten çık" (PIN + KALDIR; telefondan da).'],
    dokunma: null, sohbet: 'Güvenli kipe siz almadıysanız hemen.', telegram: null,
  },
  'gk-tekrar': {
    baslik: '{bot} güvenli kipte: aynı hata tekrar ediyor', ciddiyet: 'gecici', envanter: ['Y-22'], kilavuz: 'guvenli-kip-tekrar',
    ciddi: { ton: 'dikkat', neden: 'Aynı hata 30 dakikada 3 kez görüldü; yeni işlem açılmıyor, stoplar korunuyor.' },
    gecer: { evet: true, metin: '60 dakika aynı hata gelmezse kendiliğinden kalkar.' },
    adimlar: ['"Neyi saydı?" bölümündeki hata satırını okuyun.', 'Hata "fiyat yok / undefined / Cannot read" gibi bir kod hatasıysa kendiliğinden geçmez — geliştirme sohbetine yazın.', 'Ağ / borsa geçici hatasıysa bekleyin.'],
    kisa: ['Sağlık › bot kartında hatayı okuyun.', 'Kod hatasıysa geliştirme sohbetine yazın; değilse 60 dk bekleyin.'],
    dokunma: null, sohbet: 'Hata metni bir kod hatasına benziyorsa.', telegram: /güvenli kipte[\s\S]*aynı hata|aynı hata 30 dk'da/i,
  },

  // ═══ BORSA BAĞLANTISI / YÜRÜTÜCÜ ═══
  'yurutucu-geri-cekilme': {
    baslik: '{bot}: borsa beklemesi (hız sınırı / geçici IP yasağı)', ciddiyet: 'gecici', envanter: ['Y-26'], kilavuz: 'borsa-beklemesi',
    ciddi: { ton: 'zararsiz', neden: 'Borsaya çok sık istek gitti; süre bitene kadar bot borsaya istek atmıyor. Stoplar borsada duruyor.' },
    gecer: { evet: true, metin: 'Evet — bekleme süresi bitince yürütücü kendisi açılır.' },
    adimlar: ['Dokunmayın.'], kisa: ['Dokunmayın; bekleme bitince kendisi açılır.'],
    dokunma: 'Paneli yenilemeyin, düğmelere tekrar tekrar basmayın — 418 yasağını uzatır.', sohbet: 'Gün içinde birkaç kez tekrar ederse.', telegram: /GERI_CEKILME|geri çekilme|IP BAN|Hız sınırı/i,
  },
  'yurutucu-belirsiz': {
    baslik: '{bot}: bir emrin sonucu belirsiz — borsaya soruluyor', ciddiyet: 'gecici', envanter: ['Y-27'], kilavuz: 'emir-belirsiz',
    ciddi: { ton: 'zararsiz', neden: 'Borsa cevabı belirsiz geldi; emir gitmiş olabilir. Pusula aynı kimlikle soruyor.' },
    gecer: { evet: true, metin: 'Evet — 5 dakikada bir kendisi sorar.' },
    adimlar: ['Dokunmayın; 5 dakikada bir kendisi sorar.', '1 saati geçerse "Borsayla karşılaştır".'], kisa: ['Dokunmayın; 1 saati geçerse "Borsayla karşılaştır".'],
    dokunma: null, sohbet: '1 saatten uzun sürerse.', telegram: /\[BELIRSIZ\]|durumu belirsiz/i,
  },
  'yurutucu-elle': {
    baslik: '{bot}: borsaya emir göndermeyi durdurdu (elle müdahale gerekli)', ciddiyet: 'mudahale', envanter: ['Y-16'], kilavuz: 'yurutucu-durdu',
    ciddi: { ton: 'dikkat', neden: 'Bir emrin sonucu çözülemedi ya da API anahtarı reddedildi; bot emir göndermiyor.' },
    gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Sebep metnini okuyun.', '"çözülemedi / belirsiz" ise Binance\'te o emri (ag- ile başlar) arayın; 5 dk sonra "Borsayla karşılaştır".', '"-2015 / -2014 / izin" ise API anahtarı: Binance › API Management\'ı kontrol edin; Ayarlar › Anahtarlar › Sına.', 'Acil durdurmadan sonraysa beklenen durumdur; Botlar › Başlat.'],
    kisa: ['Sebep metnini okuyun; anahtar sorunuysa Ayarlar › Anahtarlar › Sına.', 'Emir belirsizse 5 dk sonra "Borsayla karşılaştır".'],
    dokunma: null, sohbet: 'Karşılaştırma temiz çıkmazsa.', telegram: /yürütücü DURDURULDU|emir göndermeyi durdurdu/i,
  },
  'bot-bagli-degil': {
    baslik: '{bot}: borsaya bağlı değil — yeniden deneniyor', ciddiyet: 'gecici', envanter: ['Y-45'], kilavuz: 'baglanti',
    ciddi: { ton: 'dikkat', neden: 'Bot çalışıyor ama borsa bağlantısı kurulamadı (internet, borsa, anahtar).' },
    gecer: { evet: true, metin: 'Bağlantı 1, 2, 5, 10, 30 dk arayla yeniden denenir.' },
    adimlar: ['İnterneti kontrol edin.', '30 dakikayı geçerse Ayarlar › Anahtarlar › "Sına" ile anahtarı deneyin.'], kisa: ['İnterneti kontrol edin; 30 dk geçerse Ayarlar › Anahtarlar › Sına.'],
    dokunma: null, sohbet: 'Anahtar sınaması geçtiği hâlde bağlanmıyorsa.', telegram: /açılışta bağlanılamadı|Açılışta borsaya bağlanılamadı/i,
  },
  'bot-canli-onay': {
    baslik: '{bot}: canlı hesapta emir onayı kapalı', ciddiyet: 'dikkat', envanter: ['Y-17'], kilavuz: 'canli-onay',
    ciddi: { ton: 'dikkat', neden: 'Bot çalışıyor görünür ama gerçek hesapta emir vermez (onay bir elle durdurmadan sonra düşer).' },
    gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Ayarlar › Botlar › Canlı hesap emir onayı › CANLI.'], kisa: ['Ayarlar › Botlar › Canlı hesap emir onayı.'], dokunma: null, sohbet: 'Onayı siz kaldırmadıysanız.', telegram: /emir onayı KALDIRILDI|canlı emir kilidi kapalı/i,
  },

  // ═══ RİSK / HABER (bot) ═══
  'bot-k3': {
    baslik: '{bot}: zarar sınırı (K3) çekildi — bot nakitte bekliyor', ciddiyet: 'dikkat', envanter: ['Y-04'], kilavuz: 'zarar-siniri',
    ciddi: { ton: 'dikkat', neden: 'Strateji tepeden düşüş sınırına çarptı ve kendi zarar kesicisini çekti; arıza değil. Bot "çalışıyor" görünür ama coin sepeti ve BTC sıfırda kalır.' },
    gecer: { evet: false, metin: 'Hayır — yeniden açmak bir strateji kararıdır.' },
    adimlar: ['Bu bir arıza değil; bot nakitte bekliyor (çekildiği an Telegram\'a bir kez yazıldı).', 'Önce İleri test sayfasında düşüşün modelle uyumlu olup olmadığına bakın; gerekirse geliştirme sohbetinde değerlendirin.', 'Yeniden risk almasını istiyorsanız "Zarar sınırını sıfırla" (PIN + SIFIRLA): yeni tepe = bugünkü değer. Bu bir strateji kararıdır; sıfırlarsanız bot yeniden risk alır.'],
    kisa: ['Arıza değil: bot nakitte bekliyor.', 'Yeniden açmak strateji kararıdır: Panel › Sorunlar › "Zarar sınırını sıfırla" (PIN + SIFIRLA).'], dokunma: null, sohbet: 'Sıfırlamadan önce emin değilseniz (strateji kararı).', telegram: /K3|tepeden düşüş/i,
    ekEylem: (bot) => [EY.arac('zarar-siniri-sifirla', bot, 'Zarar sınırını sıfırla…')],
  },
  'bot-marj': {
    baslik: '{bot}: teminat (marj) {seviye}', ciddiyet: 'dikkat', envanter: ['Y-32'], kilavuz: 'marj',
    ciddi: { ton: 'tehlike', neden: 'Hesaptaki teminat oranı eşiğe yaklaştı; fiyat ters giderse likidasyon riski artar. Bot kendiliğinden DURMAZ.' },
    gecer: { evet: false, metin: 'Fiyat lehte dönerse geçer; karar sizin.' },
    adimlar: ['Botlar › Hesap görünümünde teminat oranına bakın.', 'Uyarıda: genellikle beklemek yeterli; Telegram\'ı izleyin.', 'Alarmda: botu Durdur ya da gerçek tehlikede Acil durdur — ikisinin farkı kılavuzda.'],
    kisa: ['Botlar › Hesap\'ta teminat oranına bakın.', 'Alarmda Durdur ya da Acil durdur — karar sizin.'], dokunma: null, sohbet: 'Teminat nedenini anlamadıysanız.', telegram: /MARJ ALARMI|marj uyarısı/i,
  },
  'bot-zorla': {
    baslik: '{bot}: borsa bir pozisyonu zorla kapattı (ADL / likidasyon)', ciddiyet: 'mudahale', envanter: ['Y-33'], kilavuz: 'adl-likidasyon',
    ciddi: { ton: 'tehlike', neden: 'Borsa son 24 saatte bir pozisyonu kendisi kapattı; kalan bacaklar korumasız olabilir.' },
    gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Binance\'te açık pozisyonları ve stopları kontrol edin.', 'Sonraki mutabakat botu durdurur (pozisyon uyuşmazlığı); o kartta ilgili coin için "Kaydı borsaya eşitle" (PIN + ESITLE) çıkar.', 'Eşitledikten sonra "Borsayla karşılaştır"; araç "uygulanamaz" derse geliştirme sohbetine yazın.'],
    kisa: ['Binance\'te açık pozisyonları ve stopları kontrol edin.', 'Uyuşmazlık kartında "Kaydı borsaya eşitle", sonra "Borsayla karşılaştır".'], dokunma: '"Acil fren"e aceleyle basmayın — kalan her şeyi kapatır.', sohbet: 'Her zaman.', telegram: /ZORLA KAPATTI|LİKİDASYON|ADL/,
  },
  'bot-funding': {
    baslik: '{bot}: funding oranı yüksek', ciddiyet: 'bilgi', envanter: ['Y-34'], kilavuz: 'funding',
    ciddi: { ton: 'zararsiz', neden: 'Açık pozisyonlu bir coinde funding yüksek (kalabalık pozisyon işareti). Bot kararı değişmez.' },
    gecer: { evet: true, metin: 'Funding normale dönünce kaybolur.' }, adimlar: ['Yalnız bilgi — dokunmayın.'], kisa: ['Yalnız bilgi — dokunmayın.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'bot-cusum': {
    baslik: '{bot}: gerçek sonuç gölgeden kalıcı olarak {yon}', ciddiyet: 'bilgi', envanter: ['Y-35'], kilavuz: 'golge-kaymasi',
    ciddi: { ton: 'zararsiz', neden: 'Küçük ama sürekli bir fark birikti (30 günlük %3/%5 bandından önceki erken haber). Bot kararı değişmez.' },
    gecer: { evet: false, metin: 'Fark kapanırsa kaybolur.' }, adimlar: ['Yalnız bilgi. "KÖTÜ" yönündeyse bu hafta İleri test sayfasına bakın.'], kisa: ['Yalnız bilgi; KÖTÜ yönündeyse İleri test sayfasına bakın.'], dokunma: null, sohbet: 'KÖTÜ yönde birkaç hafta sürerse.', telegram: null,
  },
  'bot-maliyet': {
    baslik: '{bot}: işlem maliyeti backtest varsayımının 2 katı', ciddiyet: 'bilgi', envanter: ['Y-36'], kilavuz: 'islem-maliyeti',
    ciddi: { ton: 'zararsiz', neden: 'Piyasa emri kayması + ücret beklenenden yüksek; backtest sonuçları gerçekte bu kadar iyi olmayabilir.' },
    gecer: { evet: false, metin: '—' }, adimlar: ['Yalnız bilgi.'], kisa: ['Yalnız bilgi.'], dokunma: null, sohbet: 'Uzun süre devam ederse.', telegram: null,
  },
  'bot-kacan': {
    baslik: '{bot}: bugünkü günlük çalışma yapılmadı', ciddiyet: 'dikkat', envanter: ['Y-37', 'Y-30'], kilavuz: 'kacan-calisma',
    ciddi: { ton: 'dikkat', neden: 'Planlı 03:02 çalışması 15 dakika sonra hâlâ yapılmadı.' },
    gecer: { evet: false, metin: 'Bot kaçırılanı kendisi yapmaz; bir sonraki çalışmada bugünkü hedefe gider.' },
    adimlar: ['Sebep metnine bakın.', 'Sunucu kapalı kaldıysa bir şey yapmayın — bot bugünkü hedefe gider.', 'Sık oluyorsa sunucunun uyku / güç ayarına bakın.'], kisa: ['Sebebe bakın; sunucu kapalı kaldıysa bir şey yapmayın.'], dokunma: null, sohbet: 'Sebep "nedeni günlükte" ise.', telegram: /Kaçan planlı işlem|03:02'de yapılmadı/i,
  },
  'bot-delist': {
    baslik: '{bot}: evrendeki bir coin borsadan çıkarılıyor', ciddiyet: 'dikkat', envanter: ['Y-38'], kilavuz: 'delist',
    ciddi: { ton: 'dikkat', neden: 'Botun evrenindeki bir sözleşme kapanacak. Evren ayın 1\'inde yenilenir.' },
    gecer: { evet: false, metin: 'Delist tarihi geçince kaybolur.' }, adimlar: ['Açık pozisyon varsa delist tarihinden önce ne olacağını geliştirme sohbetine sorun.'], kisa: ['Açık pozisyon varsa geliştirme sohbetine sorun.'], dokunma: null, sohbet: 'Bu coinde açık pozisyon varsa.', telegram: /delist|kapanıyor/i,
  },
  'bot-kalp': {
    baslik: '{bot} 26 saattir başarılı çalışmadı', ciddiyet: 'mudahale', envanter: ['Y-31'], kilavuz: 'bot-calismadi',
    ciddi: { ton: 'dikkat', neden: 'Bot çalışıyor görünüyor ama son 26 saatte başarılı günlük çalışma yok.' },
    gecer: { evet: false, metin: 'Sebep geçince bir sonraki çalışmada kaybolur.' },
    adimlar: ['Sistem › Günlükler\'de botun son hatasına bakın.', 'Sunucu açık mı, Pusula çalışıyor mu kontrol edin.'], kisa: ['Sunucu açık mı, Pusula çalışıyor mu bakın; Günlükler\'de son hatayı okuyun.'], dokunma: null, sohbet: 'Sebep bulunamazsa.', telegram: /saattir çalışmadı/i,
  },
  'bot-sapma-incele': {
    baslik: '{bot}: gerçek sonuç simülasyondan ayrılmaya başladı (%3 bandı)', ciddiyet: 'dikkat', envanter: ['Y-05'], kilavuz: 'uygulama-sapmasi',
    ciddi: { ton: 'zararsiz', neden: 'Bot çalışıyor; fark %5\'e ulaşırsa bot durur.' }, gecer: { evet: false, metin: 'Fark azalırsa kaybolur.' },
    adimlar: ['Bu hafta İleri test › Kairos / Tao sayfasına bakın.'], kisa: ['Bu hafta İleri test sayfasına bakın.'], dokunma: null, sohbet: 'Fark büyümeye devam ederse.', telegram: /İNCELE bandında|Simülasyondan sapma büyüyor/i,
  },
  'bot-veri-kapisi': {
    baslik: '{bot}: borsa verisi şüpheli — günlük çalışma ertelendi', ciddiyet: 'gecici', envanter: ['Y-28'], kilavuz: 'veri-kapisi',
    ciddi: { ton: 'zararsiz', neden: 'Günlük mum bayat ya da anlamsız bir sıçrama var; bozuk veriyle karar verilmesin diye bekleniyor.' },
    gecer: { evet: true, metin: '15 dakikada bir kendisi yeniden dener.' }, adimlar: ['Dokunmayın.'], kisa: ['Dokunmayın; 15 dk\'da bir yeniden dener.'], dokunma: null, sohbet: '2 saatten uzun sürerse.', telegram: /veri kapısı|borsa verisi şüpheli/i,
  },
  'bot-tekrar-haber': {
    baslik: '{bot}: aynı hata tekrar ediyor (demo kabul — yalnız haber)', ciddiyet: 'dikkat', envanter: ['Y-22', 'Y-11'], kilavuz: 'guvenli-kip-tekrar',
    ciddi: { ton: 'dikkat', neden: 'Demo kabul süresince öz denetim bu bota dokunmaz; yalnız haber verir.' }, gecer: { evet: true, metin: 'Hata tekrarlamazsa kaybolur.' },
    adimlar: ['"Neyi saydı?" bölümündeki satırı okuyun.', 'Kod hatasına benziyorsa geliştirme sohbetine yazın.'], kisa: ['Hatayı okuyun; kod hatasına benziyorsa geliştirme sohbetine yazın.'], dokunma: null, sohbet: 'Kod hatasına benziyorsa.', telegram: /Tekrarlayan hata/i,
  },
  'bot-stop-uyari': {
    baslik: '{bot}: koruma stopu bu denetimde kurulamadı', ciddiyet: 'dikkat', envanter: ['Y-12'], kilavuz: 'stop-kurulamadi',
    ciddi: { ton: 'dikkat', neden: 'Stop her denetimde yeniden kurulur; art arda 3 denetimde kurulamazsa bot durur.' }, gecer: { evet: true, metin: 'Sonraki denetimde (saatlik) kurulursa kaybolur.' },
    adimlar: ['Binance › Koşullu emirler\'de bu coinin stopuna bakın.', 'Sonraki denetimi bekleyin.'], kisa: ['Binance\'te stopa bakın; sonraki saatlik denetimi bekleyin.'], dokunma: null, sohbet: 'Hata -2021 ise hemen.', telegram: /felaket stopu güncellenemedi|Koruma stopu güncellenemedi|felaket stopu kayboldu/i,
  },
  'bot-donma-takildi': {
    baslik: '{bot}: botun işi takıldı — Pusula yeniden başlatılacak', ciddiyet: 'gecici', envanter: ['S03'], kilavuz: 'donma',
    ciddi: { ton: 'zararsiz', neden: 'Botun işi 30 dakikadan uzun sürüyor; öz denetim Pusula\'yı uygun anda yeniden başlatır.' }, gecer: { evet: true, metin: 'Yeniden başlatmadan sonra kaybolur.' },
    adimlar: ['Dokunmayın.'], kisa: ['Dokunmayın.'], dokunma: null, sohbet: 'Gün içinde tekrar ederse.', telegram: /takıldı/i,
  },
  'tasima-mutabakat': {
    baslik: 'Taşımadan sonra botlar borsayla karşılaştırılmayı bekliyor', ciddiyet: 'dikkat', envanter: ['Y-40', 'S46'], kilavuz: 'tasima-sonrasi',
    ciddi: { ton: 'zararsiz', neden: 'Yeni bilgisayarda botlar kendiliğinden başlamaz; önce kayıtlar borsayla karşılaştırılmalı.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Eski bilgisayarda Pusula\'yı durdurun (iki bilgisayar aynı anda çalışmasın).', 'Botlar › Yönetim › "Borsayla karşılaştır", temiz çıkınca "Başlat".'], kisa: ['Eski bilgisayarı durdurun; Botlar › Borsayla karşılaştır → Başlat.'], dokunma: null, sohbet: 'Karşılaştırma temiz çıkmazsa.', telegram: null,
  },

  // ═══ GÜNCELLEME ═══
  'guncelleme-yarida': {
    baslik: 'Son güncelleme yarıda kaldı', ciddiyet: 'mudahale', envanter: ['S04'], kilavuz: 'guncelleme-yarida',
    ciddi: { ton: 'dikkat', neden: 'Güncelleyici bitmeden kapandı. Pusula çalışıyorsa eski ya da yeni kod açık; nöbetçi gerekirse Pusula\'yı yeniden açar.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Ayarlar › Güncelleme › "Şimdi kontrol et".', 'Sonucu (ekran görüntüsü ya da "Sohbete gönder") geliştirme sohbetine iletin.'], kisa: ['Ayarlar › Güncelleme › Şimdi kontrol et.'],
    dokunma: 'node_modules.yedek-* klasörlerini silmeyin — geri alma için gerekebilir.', sohbet: 'Kontrol yine yarıda kalırsa.', telegram: /güncellemesi yarıda kaldı|yarıda kaldı/i,
    ekEylem: () => [EY.git('Ayarlar › Güncelleme', '#/ayarlar/guncelleme')],
  },
  'guncelleme-elle': {
    baslik: 'Güncelleme kendiliğinden kurulamadı — elle bakılmalı', ciddiyet: 'mudahale', envanter: ['S07'], kilavuz: 'guncelleme-elle',
    ciddi: { ton: 'zararsiz', neden: 'Çalışan sürüm sağlam; yalnız yeni sürüm kurulmadı.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Ayarlar › Güncelleme\'deki nedeni okuyun.', '"gönderilmemiş commit": sunucuda `git pull` sonra `git push`, ardından "Şimdi kontrol et".', '"değişmiş dosya / dal / merge": dokunmayın — `git status` çıktısını geliştirme sohbetine gönderin.', '"başlatma dosyaları": Pusula\'yı durdur → `git pull` → Pusula.'],
    kisa: ['Ayarlar › Güncelleme\'deki nedeni okuyun.', 'Emin değilseniz "Sohbete gönder" ile geliştirme sohbetine iletin.'], dokunma: '`git reset` / `git checkout` ile kendiniz geri almayın.', sohbet: 'Neden "geliştirme sohbetine haber verin" diyorsa.', telegram: /güncellemesi: elle bakılmalı|kendiliğinden kurulamadı/i,
    ekEylem: () => [EY.git('Ayarlar › Güncelleme', '#/ayarlar/guncelleme')],
  },
  'guncelleme-imzasiz': {
    baslik: 'İMZASIZ kod geldi — kurulmadı', ciddiyet: 'mudahale', envanter: ['S07'], kilavuz: 'guncelleme-imzasiz',
    ciddi: { ton: 'tehlike', neden: 'Gelen kod imza doğrulamasından geçmedi. GitHub hesabı ya da geliştirme bilgisayarı ele geçirilmiş olabilir. Kod KURULMADI.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Kurmayın.', 'Kodu siz göndermediyseniz GitHub parolanızı ve jetonlarınızı değiştirin.', 'Hemen geliştirme sohbetine yazın.'], kisa: ['Kurmayın; GitHub parolasını değiştirin.', 'Hemen geliştirme sohbetine yazın.'], dokunma: null, sohbet: 'Hemen.', telegram: /İMZASIZ KOD/,
  },
  'guncelleme-geri-alindi': {
    baslik: 'Yeni sürüm kurulamadı, eski sürüme dönüldü', ciddiyet: 'dikkat', envanter: ['S08'], kilavuz: 'guncelleme-geri-alindi',
    ciddi: { ton: 'zararsiz', neden: 'Eski sürüm çalışıyor; yeni sürüm bu sunucuda kararlı açılmadı.' }, gecer: { evet: false, metin: 'Düzeltilmiş sürüm gelince kendiliğinden kurulur.' },
    adimlar: ['Ayarlar › Güncelleme\'deki geri alma nedenini geliştirme sohbetine gönderin.'], kisa: ['Geri alma nedenini geliştirme sohbetine gönderin.'], dokunma: null, sohbet: 'Her zaman (neden bilinmeli).', telegram: /kurulamadı — geri alındı|eski sürüme dönüldü/i,
  },
  'guncelleme-onay': {
    baslik: 'Onayınızı bekleyen güncelleme: {surum}', ciddiyet: 'dikkat', envanter: ['S24', 'Y-20'], kilavuz: 'guncelleme-onay',
    ciddi: { ton: 'zararsiz', neden: 'Yeni sürüm bot kodunu da değiştiriyor; kurulana kadar eski sürüm çalışır.' }, gecer: { evet: false, metin: 'Hayır — onay bekliyor.' },
    adimlar: ['Sürüm notunu okuyun (Bilgi › Kılavuz › Sürüm notları).', 'Uygun bir saatte (02:50–04:30 dışında) Ayarlar › Güncelleme › "Güncellemeyi kur" — telefondan da (acil PIN + GÜNCELLE).'],
    kisa: ['Uygun bir saatte Ayarlar › Güncelleme › Güncellemeyi kur (telefondan da olur).'], dokunma: null, sohbet: 'Kuru denemede karar farkı çıktıysa ve sürüm notu bunu söylemiyorsa.', telegram: /kurulmayı bekliyor|onayını bekliyor/i,
    ekEylem: () => [EY.git('Güncellemeyi kur…', '#/ayarlar/guncelleme'), EY.git('Sürüm notu', '#/kilavuz/surum-notlari')],
  },
  'guncelleme-yeniden-baslat': {
    baslik: 'Yeni kod indi — Pusula yeniden başlatılmalı', ciddiyet: 'dikkat', envanter: ['S25'], kilavuz: 'yeniden-baslatma-gerekli',
    ciddi: { ton: 'zararsiz', neden: 'Eski Pusula çalışıyor, yeni kod diskte bekliyor.' }, gecer: { evet: false, metin: 'Bir sonraki yeniden başlatmada geçer.' },
    adimlar: ['Uygun bir saatte (02:50–04:30 dışında) sunucuda masaüstündeki Pusula\'yı durdur → Pusula kısayolları; uzaktaysanız telefonda Sorunlar › Pusula\'yı yeniden başlat (acil PIN).'], kisa: ['Uygun bir saatte Pusula\'yı yeniden başlatın (02:50–04:30 dışında).'], dokunma: null, sohbet: 'Yeniden başlatma başarısız olursa.', telegram: /yeniden başlatma gerekli/i,
  },
  'guncelleme-kapali': {
    baslik: 'Güncellemeden sonra Pusula KAPALI kaldı', ciddiyet: 'mudahale', envanter: ['S25'], kilavuz: 'yeniden-baslatma-gerekli',
    ciddi: { ton: 'tehlike', neden: 'Pusula kapalıyken botlar karar veremez (pozisyonlar ve stoplar borsada durur).' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Sunucuda masaüstündeki Pusula kısayoluna tıklayın.'], kisa: ['Sunucuda Pusula kısayoluna tıklayın.'], dokunma: null, sohbet: 'Açılmazsa.', telegram: null,
  },
  'guncelleme-github': {
    baslik: 'Güncellemeler denetlenemiyor (GitHub\'a ulaşılamadı)', ciddiyet: 'gecici', envanter: ['S22'], kilavuz: 'github',
    ciddi: { ton: 'zararsiz', neden: 'İnternet ya da GitHub girişi sorunu; çalışan sürüm etkilenmez.' }, gecer: { evet: true, metin: 'İnternet gelince bir sonraki denemede (12:00) geçer.' },
    adimlar: ['İnterneti kontrol edin.', 'Birkaç gün sürerse sunucuda `cd /d C:\\Pusula` → `git fetch origin main`; giriş isterse tarayıcıdan GitHub\'a giriş yapın.'], kisa: ['İnterneti kontrol edin; sürerse sunucuda git fetch deneyin.'], dokunma: null, sohbet: '3 günden uzun sürerse.', telegram: /GitHub'a ulaşılamıyor|Güncellemeler denetlenemiyor/i,
  },
  'guncelleme-imza-yok': {
    baslik: 'Kod imza doğrulaması kurulmamış', ciddiyet: 'dikkat', envanter: ['S23'], kilavuz: 'imza-kurulmamis',
    ciddi: { ton: 'dikkat', neden: 'Güncellemeler imzasız da kurulur; ele geçirilmiş bir depodan gelen kodu ayırt edemez.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Sunucuda bir kez `npm run imza-kur` (Kılavuz › Güncelleme).'], kisa: ['Sunucuda bir kez npm run imza-kur.'], dokunma: null, sohbet: 'Komut hata verirse.', telegram: null,
  },

  // ═══ TELEGRAM / SİNYAL ═══
  'telegram-409': {
    baslik: 'Telegram komutları çalışmıyor: başka bir bilgisayar aynı botu yokluyor (409)', ciddiyet: 'dikkat', envanter: ['S05', 'S06'], kilavuz: 'telegram-409',
    ciddi: { ton: 'dikkat', neden: 'Aynı Telegram jetonunu başka bir bilgisayar ya da program da kullanıyor (çoğu zaman taşımadan sonra açık kalan eski bilgisayar). İki bilgisayarda bot da çalışıyorsa çift emir riski var.' },
    gecer: { evet: true, metin: 'Çakışan program kapanınca birkaç dakika içinde.' },
    adimlar: ['Eski bilgisayarda masaüstündeki "Pusula\'yı durdur"a tıklayın.', 'Orada Görev Zamanlayıcı\'da PusulaBot ve PusulaBekci görevlerini devre dışı bırakın.', 'Telegram\'a /durum yazın: tek cevap gelmeli.'], kisa: ['Eski bilgisayarda Pusula\'yı durdurun.', 'Telegram\'a /durum yazın: tek cevap gelmeli.'], dokunma: null, sohbet: 'Tek bilgisayar açıkken de sürerse.', telegram: null,
  },
  'telegram-401': {
    baslik: 'Telegram jetonu geçersiz (401)', ciddiyet: 'mudahale', envanter: ['S20'], kilavuz: 'telegram-gonderim',
    ciddi: { ton: 'tehlike', neden: 'Pusula size Telegram\'dan uyarı gönderemiyor.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Sunucudaki panelde Ayarlar › Bildirimler › yeni jetonu girin → Test.', 'İkinci uyarı kanalı (ntfy) kurulu değilse şimdi kurun (Sistem › Sağlık).'], kisa: ['Sunucuda Ayarlar › Bildirimler › jetonu yeniden girin.'], dokunma: null, sohbet: 'Yeni jetonla da olmuyorsa.', telegram: null,
  },
  'telegram-gonderim': {
    baslik: 'Telegram\'a ileti gönderilemiyor', ciddiyet: 'mudahale', envanter: ['S20'], kilavuz: 'telegram-gonderim',
    ciddi: { ton: 'tehlike', neden: 'Uyarılar size ulaşmıyor olabilir (jeton, Chat ID, bot engellendi ya da internet).' }, gecer: { evet: false, metin: 'İnternet sorunuysa kendiliğinden; değilse hayır.' },
    adimlar: ['Telegram\'da bota /start yazın; engellediyseniz engeli kaldırın.', 'Sunucuda Ayarlar › Bildirimler › Test mesajı gönder.', 'İkinci uyarı kanalı (ntfy) kurulu değilse Sistem › Sağlık\'tan kurun.'], kisa: ['Telegram\'da bota /start yazın; sunucuda Ayarlar › Bildirimler › Test.'], dokunma: null, sohbet: 'Test de başarısızsa.', telegram: null,
  },
  'telegram-bagli-degil': {
    baslik: 'Telegram bağlı değil', ciddiyet: 'dikkat', envanter: ['S20'], kilavuz: 'telegram-gonderim',
    ciddi: { ton: 'dikkat', neden: 'Pusula size uyarı gönderemez.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Sunucuda Ayarlar › Bildirimler › Telegram\'ı etkinleştirin, jeton ve Chat ID girin → Test.'], kisa: ['Sunucuda Ayarlar › Bildirimler\'de Telegram\'ı kurun.'], dokunma: null, sohbet: 'Kurulumda takılırsanız.', telegram: null,
  },
  'telegram-kuyruk': {
    baslik: 'Telegram iletileri giden kutusunda bekliyor', ciddiyet: 'gecici', envanter: ['S44'], kilavuz: 'telegram-kuyruk',
    ciddi: { ton: 'zararsiz', neden: 'İnternet / Telegram geçici olarak ulaşılamadı; iletiler sırayla "[gecikmeli]" önekiyle gidecek.' }, gecer: { evet: true, metin: 'Bağlantı gelince kendiliğinden gönderilir.' },
    adimlar: ['Dokunmayın.'], kisa: ['Dokunmayın; bağlantı gelince gider.'], dokunma: null, sohbet: '1 saatten uzun sürerse.', telegram: null,
  },
  'sinyal-yok': {
    baslik: 'Sunucu sessizce kapanırsa sizi uyaracak dış sinyal kurulmamış', ciddiyet: 'dikkat', envanter: ['S21'], kilavuz: 'saglik-sinyali',
    ciddi: { ton: 'dikkat', neden: 'Elektrik kesilir ya da Pusula çökerse dışarıdan uyaran kimse olmaz.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['healthchecks.io\'da ücretsiz bir "check" açın.', 'Ping adresini Ayarlar › Bildirimler › Sağlık sinyali › Sunucu alanına girin.'], kisa: ['healthchecks.io\'da ücretsiz check açıp adresi Ayarlar › Bildirimler\'e girin.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'sinyal-ping': {
    baslik: 'Sağlık sinyali gönderilemedi', ciddiyet: 'gecici', envanter: ['S21'], kilavuz: 'saglik-sinyali',
    ciddi: { ton: 'zararsiz', neden: 'Son ping başarısız ya da eski; çoğu zaman internet kesintisi.' }, gecer: { evet: true, metin: 'İnternet gelince bir sonraki pingde.' },
    adimlar: ['İnterneti kontrol edin.', 'Sürerse Ayarlar › Bildirimler › Sağlık sinyali › Test.'], kisa: ['İnterneti kontrol edin.'], dokunma: null, sohbet: 'Test de başarısızsa.', telegram: null,
  },

  // ═══ SUNUCU / BİLGİSAYAR ═══
  'cokme-dongusu': {
    baslik: 'Pusula açılıp hemen kapanıyordu (çökme döngüsü)', ciddiyet: 'mudahale', envanter: ['S09', 'S10'], kilavuz: 'cokme-dongusu',
    ciddi: { ton: 'tehlike', neden: 'Pusula art arda açılıp kapandı; botlar bu sırada karar veremez.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Sunucuda `data\\sunucu-konsol.log` dosyasının son satırlarına bakın.', '"Cannot find module" → antivirüs dosya silmiş olabilir (kılavuz: Antivirüs).', '"Port 3000 kullanımda" → Pusula\'yı durdur, sonra Pusula.', 'Başka bir şey → son satırları geliştirme sohbetine gönderin.'], kisa: ['Sunucuda konsol günlüğünün son satırlarına bakın.', 'Son satırları geliştirme sohbetine gönderin.'], dokunma: 'Görev Yöneticisi\'nden node.exe süreçlerini toplu kapatmayın.', sohbet: 'Her zaman.', telegram: /çökme döngüsü|açılamıyor/i,
  },
  'acilis-sayaci': {
    baslik: 'Pusula bugün beklenmedik biçimde çok açıldı', ciddiyet: 'dikkat', envanter: ['S12'], kilavuz: 'acilis-sayaci',
    ciddi: { ton: 'dikkat', neden: 'Günde 5\'ten çok PLANSIZ açılış = Pusula çöküyor (güncelleme ve sizin yeniden başlatmalarınız sayılmaz).' }, gecer: { evet: true, metin: 'Gece yarısı sayaç sıfırlanır.' },
    adimlar: ['Sağlık › Onarım ve olay kaydında nedenlere bakın.', 'Konsol günlüğünün son satırlarını geliştirme sohbetine gönderin.'], kisa: ['Konsol günlüğünün son satırlarını geliştirme sohbetine gönderin.'], dokunma: null, sohbet: 'Her zaman.', telegram: /kez beklenmedik biçimde açıldı|Pusula süreci/i,
  },
  'denetleyicisiz': {
    baslik: 'Pusula denetleyicisiz başlatılmış', ciddiyet: 'dikkat', envanter: ['S48'], kilavuz: 'denetleyicisiz',
    ciddi: { ton: 'dikkat', neden: 'Çökerse yalnız bekçi açar (geç); güncelleme Pusula\'yı yeniden başlatamaz.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Uygun bir saatte Pusula\'yı durdur → masaüstündeki Pusula kısayoluyla açın.'], kisa: ['Pusula\'yı durdurup kısayolla yeniden açın.'], dokunma: null, sohbet: 'Kısayolla açınca da sürerse.', telegram: null,
  },
  'donma-oldu': {
    baslik: 'Pusula dondu ve kendini yeniden açtı', ciddiyet: 'bilgi', envanter: ['S03'], kilavuz: 'donma',
    ciddi: { ton: 'zararsiz', neden: 'Donma bekçisi sağlık ucundan 10 dakika yanıt alamayınca yalnız kendi sürecini kapattı; denetleyici açtı.' }, gecer: { evet: true, metin: '24 saat sonra bu kart kaybolur.' },
    adimlar: ['Bir şey yapmayın.', 'Tekrar ederse "Sohbete gönder".'], kisa: ['Bir şey yapmayın; tekrar ederse geliştirme sohbetine yazın.'], dokunma: null, sohbet: 'Gün içinde tekrar ederse.', telegram: /dondu/i,
  },
  'disk': {
    baslik: 'Disk alanı azaldı', ciddiyet: 'dikkat', envanter: ['S26'], kilavuz: 'disk',
    ciddi: { ton: 'dikkat', neden: 'Disk dolarsa botlar kayıt yazamaz.' }, gecer: { evet: false, metin: 'Hayır (30 günden eski günlükler kendiliğinden sıkıştırılır).' },
    adimlar: ['Güvenle silinebilir: güncelleme "kuruldu" dedikten sonra node_modules.yedek-* klasörleri; Yedek ve taşıma › eski taşıma dosyaları.', 'Yedek hedefi aynı diskteyse başka bir diske alın.'], kisa: ['Eski node_modules.yedek-* klasörlerini ve eski taşıma dosyalarını silin.'],
    dokunma: 'data\\live, ileri, ileriye-kayit ve tarama klasörlerine dokunmayın.', sohbet: 'Ne sileceğinizden emin değilseniz.', telegram: /Disk dolmak üzere|DİSK SAĞLIĞI/i,
  },
  'bellek': {
    baslik: 'Pusula çok bellek kullanıyor', ciddiyet: 'gecici', envanter: ['S26'], kilavuz: 'bellek',
    ciddi: { ton: 'zararsiz', neden: 'Öz denetim sessiz saatte (çalışma sürmüyorken, 02:30–04:30 dışında) Pusula\'yı yeniden başlatır.' }, gecer: { evet: true, metin: 'Sessiz saatte yeniden başlatmayla.' },
    adimlar: ['Dokunmayın.'], kisa: ['Dokunmayın.'], dokunma: null, sohbet: 'Her gün tekrar ederse.', telegram: null,
  },
  'yedek': {
    baslik: 'Yedek alınamadı ya da eski', ciddiyet: 'dikkat', envanter: ['S27'], kilavuz: 'yedek',
    ciddi: { ton: 'dikkat', neden: 'Sunucu bozulursa son kayıtlar kaybolabilir.' }, gecer: { evet: true, metin: 'Sonraki 05:30 yedeğinde başarılı olursa geçer.' },
    adimlar: ['USB / ikinci disk takılı mı bakın.', '"ENOSPC" yazıyorsa yedek diski dolmuş.', 'Ayarlar › Yedek ve taşıma\'da son yedeğin durumuna bakın.'], kisa: ['Yedek diski takılı mı, dolu mu bakın.'], dokunma: null, sohbet: '2 gün üst üste olursa.', telegram: /yedeği alınamadı|yedek/i,
  },
  'uzak-yedek': {
    baslik: 'Şifreli uzak yedek kurulmamış ya da eski', ciddiyet: 'bilgi', envanter: ['S27'], kilavuz: 'yedek',
    ciddi: { ton: 'dikkat', neden: 'Sunucu çalınır / yanar / diski bozulursa yerel kopyalar da gider.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Kılavuz › Yedek ve taşıma › Şifreli uzak yedek (restic + rclone, ücretsiz).'], kisa: ['Kılavuz › Yedek ve taşıma › Şifreli uzak yedek.'], dokunma: null, sohbet: 'Kurulumda takılırsanız.', telegram: null,
  },
  // 4. faz (4c): D1 geri dönüş tatbikatı geçmedi ya da 40 günden uzun süredir yapılmadı (lib/tatbikat/geriDonus.js) — yalnız haber
  'geri-donus': {
    baslik: 'Geri dönüş tatbikatı geçmedi ya da yapılmadı', ciddiyet: 'bilgi', envanter: [], kilavuz: 'geri-donus',
    ciddi: { ton: 'dikkat', neden: 'Botları etkilemez. Ama bir makine bozulursa botun yedekten ya da eş kopyasından geri getirilemeyebileceğini gösterir.' }, gecer: { evet: true, metin: 'Sebep düzeltilip tatbikat yeniden geçince.' },
    adimlar: ['Sistem › Tatbikatlar › Geri dönüş kartında hangi botun hangi adımda kaldığını okuyun.', '"Yedek bozuk / bulunamadı" → yedek diski takılı mı, son 05:30 yedeği alındı mı bakın.', '"Yedek şifresiyle çözülemedi / anahtar yok" → iki bilgisayarda Ayarlar › Yedek & taşıma\'dan AYNI yedek şifresini girin, eşte bir sonraki saat başı kopyayı bekleyin.', 'Düzeltince "Şimdi çalıştır".'],
    kisa: ['Sistem › Tatbikatlar › Geri dönüş.'], dokunma: null, sohbet: 'Kuru deneme hatası sürerse.', telegram: null,
    ekEylem: () => [EY.git('Sistem › Tatbikatlar', '#/tatbikat')],
  },
  // 4. faz (4a): eşlenmiş sunucunun saat başı kopyası eski ya da alınamıyor (lib/makine/kopya.js) — yalnız haber
  'es-kopya': {
    baslik: 'Eş makinenin kopyası eski ya da alınamıyor', ciddiyet: 'bilgi', envanter: [], kilavuz: 'es-kopya',
    ciddi: { ton: 'dikkat', neden: 'Botları etkilemez. Ama o makine bozulursa elinizdeki kopya eski kalır (devralma ve geri dönüş tatbikatı son kopyayla yapılır).' }, gecer: { evet: true, metin: 'Eş açılıp bir sonraki saat başı kopya alınınca.' },
    adimlar: ['Ayarlar › Makineler › Eş kopyaları kartında nedeni okuyun.', 'Eş kapalıysa ya da Tailscale bağlı değilse açın; sonra "Şimdi kopya al".', '"Yedek şifresi yok / farklı" yazıyorsa: iki bilgisayarda Ayarlar › Yedek & taşıma\'dan AYNI yedek şifresini girin.', '"Sürüm uyumsuz / kopyayı bilmiyor" yazıyorsa iki makineyi aynı sürüme güncelleyin.'],
    kisa: ['Ayarlar › Makineler › Eş kopyaları.'], dokunma: null, sohbet: 'Bir günden uzun sürerse.', telegram: null,
    ekEylem: () => [EY.git('Ayarlar › Makineler', '#/ayarlar/makineler')],
  },
  // 77.8 (kullanıcı 2026-10-26, "Telefondan devralma"): eşlenmiş SUNUCU 30 dk'dan uzun sessiz ve kopyası burada — telefondan devral aracı
  'makine-sessiz': {
    baslik: 'Makine sessiz: {makine}', ciddiyet: 'dikkat', envanter: [], kilavuz: 'makine-sessiz',
    ciddi: { ton: 'dikkat', neden: 'O makinedeki botlar karar veremiyor olabilir; açık pozisyonların felaket stopları borsada durur. Makine kalıcı olarak gittiyse botu bu sunucuya devralabilirsiniz.' },
    gecer: { evet: true, metin: 'Makine açılıp nabız gönderince kart kalkar.' },
    adimlar: ['Önce makinenin neden sessiz olduğunu öğrenin (elektrik, internet, Tailscale) — kılavuzdaki "Sunucu sessiz" karar ağacı.', 'Kısa bir kesintiyse bekleyin: makine açılınca botlar kendiliğinden devam eder.', 'Makine KALICI olarak gittiyse (bozuldu, çalındı) ve kapalı olduğundan eminseniz: botun "devral (PIN)" düğmesi — önizleme, "kapalı olduğunu biliyorum" kutusu, DEVRAL + acil PIN.', 'Devraldıktan sonra demo botta emir listesini onaylayın (SAHİPLEN), sonra bu sayfadan bir kez Başlat.'],
    kisa: ['Makinenin neden sessiz olduğuna bakın (elektrik / internet / Tailscale).', 'Kalıcı gittiyse ve kapalı olduğundan eminseniz Sorunlar sayfasından devral (PIN).'],
    dokunma: 'Eski makine açık ama yalnız ağı kopuksa devralmayın — iki makine aynı borsa hesabına emir gönderebilir.', sohbet: 'Devralma "yapılamadı" derse ya da makine bir günden uzun sessizse.', telegram: null,
    ekEylem: () => [EY.git('Ayarlar › Makineler', '#/ayarlar/makineler')],
  },
  // 77.8: bu sunucuya devralınmış demo botta borsadaki emir listesi onay bekliyor (SAHİPLEN) — onaydan önce Mutabakat / Başlat kapalı
  'devralma-sahiplen': {
    baslik: '{bot}: devralındı — emir listesi onayınızı bekliyor', ciddiyet: 'mudahale', envanter: [], kilavuz: 'devralma-bekliyor',
    ciddi: { ton: 'dikkat', neden: 'Bot bu sunucuya alındı ama borsada, bu botun defterinin bilmediği bizim emirlerimiz olabilir (eski makine son kopyadan sonra vermiş). Onaylanana kadar bot başlamaz; acil durdurma serbest.' },
    gecer: { evet: false, metin: 'Hayır — sizin onayınızı bekliyor.' },
    adimlar: ['"Emir listesini onayla (PIN)" → önizlemede listeyi okuyun (her satırda ne olacağı yazar).', 'Doğruysa SAHİPLEN + acil PIN. Liste bu arada değişirse hiçbir şey uygulanmaz, yeni liste gelir.', 'Temizse bu sayfada "Başlat (bir kez)" kartı çıkar.'],
    kisa: ['Sorunlar › emir listesini onayla (SAHİPLEN + PIN).'], dokunma: null, sohbet: 'Liste okunamıyorsa ya da onaydan sonra TEMİZ DEĞİL derse.', telegram: null,
    ekEylem: () => [EY.git('Ayarlar › Makineler', '#/ayarlar/makineler')],
  },
  // 77.8: devralınan bot temiz, henüz başlatılmadı — telefondan BİR KEZ Başlat (24 saat içinde)
  'devralma-baslat': {
    baslik: '{bot}: devralındı — başlatılmayı bekliyor', ciddiyet: 'dikkat', envanter: [], kilavuz: 'devralma-bekliyor',
    ciddi: { ton: 'dikkat', neden: 'Bot bu sunucuya alındı, borsayla karşılaştırma temiz; kendiliğinden başlamaz. Durdukça günlük kararı kaçırır (kaçan günü sonra kendisi sayar).' },
    gecer: { evet: false, metin: 'Hayır — Başlat sizde.' },
    adimlar: ['Eski makinenin kapalı olduğundan eminseniz "Başlat (PIN, bir kez)" → önizleme → BAŞLAT + acil PIN.', 'Telefondan Başlat yalnız devralmadan sonraki ilk başlatma için ve 24 saat açıktır; sonrası sunucudaki panelde.'],
    kisa: ['Sorunlar › Başlat (bir kez, PIN).'], dokunma: null, sohbet: 'Başlat "yapılamadı" derse.', telegram: null,
  },
  'wyb': {
    baslik: 'Windows yeniden başlatma bekliyor', ciddiyet: 'dikkat', envanter: ['S28'], kilavuz: 'windows-yeniden-baslatma',
    ciddi: { ton: 'dikkat', neden: 'Windows gece yeniden başlatırsa 03:02 çalışması kaçabilir.' }, gecer: { evet: false, metin: 'Elle yeniden başlatınca geçer.' },
    adimlar: ['Uygun bir gündüz saatinde bilgisayarı elle yeniden başlatın.', 'Kalıcı çözüm: sunucuda yönetici olarak scripts\\windows-etkin-saat.ps1 (etkin saatler 21:00–15:00).'], kisa: ['Gündüz bilgisayarı elle yeniden başlatın.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'uyku': {
    baslik: 'Sunucu bilgisayarı uykuya geçebiliyor', ciddiyet: 'dikkat', envanter: ['S29'], kilavuz: 'uyku',
    ciddi: { ton: 'dikkat', neden: 'Uyuyan bilgisayarda Pusula çalışmaz.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Denetim Masası › Güç Seçenekleri › "Bilgisayarı uyku moduna geçir" ve "Hazırda beklet" → Asla (prize takılıyken).'], kisa: ['Güç Seçenekleri\'nde uyku ve hazırda beklemeyi "Asla" yapın.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'saat': {
    baslik: 'Bilgisayar saati borsadan farklı', ciddiyet: 'dikkat', envanter: ['S30', 'Y-47'], kilavuz: 'saat-farki',
    ciddi: { ton: 'dikkat', neden: 'Saat farkı büyürse borsa emirleri reddeder (-1021).' }, gecer: { evet: false, metin: 'Eşitleyince geçer.' },
    adimlar: ['Ayarlar › Saat ve dil › "Saati şimdi eşitle" (Windows).'], kisa: ['Windows › Saat ve dil › Saati şimdi eşitle.'], dokunma: null, sohbet: 'Eşitledikten sonra sürerse.', telegram: /borsa saatiyle fark/i,
  },
  'saat-dilimi': {
    baslik: 'Sunucunun saat dilimi İstanbul değil', ciddiyet: 'dikkat', envanter: ['S50'], kilavuz: 'saat-dilimi',
    ciddi: { ton: 'dikkat', neden: 'Zamanlanmış görevler (yedek, güncelleme) yerel saatle çalışır; saat dilimi yanlışsa kayarlar.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Windows › Saat ve dil › Saat dilimi: (UTC+03:00) İstanbul.'], kisa: ['Windows saat dilimini İstanbul yapın.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'node': {
    baslik: 'Node.js desteği bitiyor', ciddiyet: 'dikkat', envanter: ['S31'], kilavuz: 'node',
    ciddi: { ton: 'dikkat', neden: 'Destek bitince güvenlik düzeltmesi gelmez.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Geliştirme sohbetine "Node yükseltmesi" yazın; yükseltme yordamı kılavuzda.'], kisa: ['Geliştirme sohbetine Node yükseltmesini yazın.'], dokunma: 'Node\'u sohbette konuşmadan kendiniz yükseltmeyin.', sohbet: 'Her zaman.', telegram: null,
  },
  'paket': {
    baslik: 'Paket güvenlik taramasında açık var', ciddiyet: 'bilgi', envanter: ['S32'], kilavuz: 'paket-guvenligi',
    ciddi: { ton: 'zararsiz', neden: 'Düzeltme geliştirme tarafında yapılır, güncellemeyle gelir. Sizin yapacağınız bir şey yok.' }, gecer: { evet: true, metin: 'Düzeltme sürümü kurulunca.' },
    adimlar: ['Bir şey yapmayın.'], kisa: ['Bir şey yapmayın.'], dokunma: 'npm install / npm audit fix çalıştırmayın.', sohbet: 'Kritik açık bir haftadan uzun sürerse.', telegram: null,
  },
  // C5: öz denetim "API anahtarı yetkisi" (günde bir SALT OKUMA sınaması) — yalnız haber, hiçbir bota dokunmaz.
  'anahtar-cekme-izni': {
    baslik: '{hesap}: API anahtarında PARA ÇEKME izni açık', ciddiyet: 'mudahale', envanter: ['S51'], kilavuz: 'anahtar-yetkisi',
    ciddi: { ton: 'tehlike', neden: 'Anahtar dosyası (secrets.json) şifresiz durur; koruma anahtarın kendisindedir. Para çekme izni açık bir anahtar kopyalanırsa hesaptaki para dışarı çekilebilir.' },
    gecer: { evet: false, metin: 'Hayır — izni borsada siz kapatınca, sonraki sınamada kart kalkar.' },
    adimlar: ['Borsanın sitesinde API yönetimine girin; bu anahtarın "Para çekme" (Withdraw) iznini KAPATIN.', 'Canlı hesapsa IP kısıtını da açın (yalnız sunucunun IP adresi).', 'Panelde Ayarlar › Anahtarlar › bu satır › Sına — kart sonraki yoklamada kalkar.', 'Anahtarı başkasının gördüğünden şüpheleniyorsanız silip yenisini oluşturun.'],
    kisa: ['Borsada bu anahtarın para çekme iznini hemen kapatın.', 'Sonra Ayarlar › Anahtarlar › Sına.'],
    dokunma: 'Botu durdurmanız gerekmez; pozisyonlara dokunmayın — sorun anahtarın izninde.', sohbet: 'İzni kapattığınız halde kart kalkmıyorsa.', telegram: /API anahtarı yetkisi/,
  },
  'anahtar-ip-yok': {
    baslik: '{hesap}: canlı API anahtarında IP kısıtı yok', ciddiyet: 'dikkat', envanter: ['S51'], kilavuz: 'anahtar-yetkisi',
    ciddi: { ton: 'dikkat', neden: 'Para çekme kapalı; ama IP kısıtı olmayan anahtar her yerden işlem açabilir. Canlı hesapta IP kısıtı zorunlu.' },
    gecer: { evet: false, metin: 'Hayır — IP kısıtını borsada açınca, sonraki sınamada geçer.' },
    adimlar: ['Borsanın API yönetiminde bu anahtara IP kısıtı ekleyin (yalnız sunucunun IP adresi).', 'Ayarlar › Anahtarlar › Sına.'],
    kisa: ['Borsada anahtara IP kısıtı ekleyin.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'anahtar-salt-okuma-degil': {
    baslik: '{hesap}: İşlem defterim anahtarı salt okuma değil', ciddiyet: 'dikkat', envanter: ['S51'], kilavuz: 'anahtar-yetkisi',
    ciddi: { ton: 'dikkat', neden: 'İşlem defterim yalnız okur; işlem izni olan anahtar gereksiz risk taşır.' },
    gecer: { evet: false, metin: 'Hayır — izni borsada daraltınca geçer.' },
    adimlar: ['Borsada bu anahtarın işlem iznini kapatın (yalnız okuma bırakın) ya da salt okuma bir anahtar oluşturup İşlem defterim ekranında değiştirin.', 'Ayarlar › Anahtarlar › Sına.'],
    kisa: ['Anahtarı salt okumaya indirin.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'sir-kilitli': {
    baslik: 'API anahtarları okunamıyor (eski şifreli dosya)', ciddiyet: 'mudahale', envanter: ['S33'], kilavuz: 'sir-dosyasi',
    ciddi: { ton: 'tehlike', neden: 'Botlar borsaya bağlanamaz.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Pusula-69.0 paketi duruyorsa onun scripts\\sir-coz.ps1 betiğini Pusula\'yı çalıştıran kullanıcıyla bir kez çalıştırın.', 'Paket yoksa: secrets.json\'u kenara kopyalayın, silin; anahtarları ve Telegram jetonunu panelden yeniden girin.'], kisa: ['Sunucuda sir-coz betiğini çalıştırın ya da anahtarları yeniden girin.'], dokunma: null, sohbet: 'Emin değilseniz.', telegram: null,
  },
  'dosya-bozuk': {
    baslik: 'Bir ayar dosyası bozuk açıldı', ciddiyet: 'dikkat', envanter: ['S34', 'S35'], kilavuz: 'ayar-bozuk',
    ciddi: { ton: 'dikkat', neden: 'Son sağlam kopyadan açıldı; son ayar değişikliğiniz kaybolmuş olabilir.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Son değiştirdiğiniz ayarı yeniden girin.', 'Anahtarlar okunamıyorsa Ayarlar › Anahtarlar\'dan yeniden girin.', 'Dosya .bozuk-*.bak olarak saklandı; geliştirme sohbetine iletin.'], kisa: ['Son ayar değişikliğinizi yeniden girin.'], dokunma: null, sohbet: 'Tekrar ederse (disk sorunu olabilir).', telegram: /Ayar dosyası bozuk/i,
  },
  // 78.x (S-003 / A-01): lib/database.js açılışta bozuk bulup kenara aldığı dosyalar (öz denetim "dosya" satırından ayrılır)
  'kayit-dosyasi-bozuk': {
    baslik: 'Bir kayıt dosyası bozuk açıldı (kenara alındı)', ciddiyet: 'dikkat', envanter: ['S-003'], kilavuz: 'kayit-dosyasi-bozuk',
    ciddi: { ton: 'dikkat', neden: 'Para ve pozisyon etkilenmez (bot durumları ayrı dosyalarda). İşlem geçmişi / özsermaye eğrisi / günlük eksik görünebilir.' },
    gecer: { evet: false, metin: 'Pusula yeniden başlayınca kart kalkar; bozuk dosya .bozuk-*.bak olarak durur.' },
    adimlar: ['Bir şey silmeyin: bozuk dosya .bozuk-*.bak adıyla kenarda duruyor.', 'Son iyi kopyadan açıldıysa en çok son açılıştan bu yana olan kayıtlar eksiktir.', 'Eksik kayıtlar gerekiyorsa Ayarlar › Yedek ve taşıma\'daki son yedekten geri getirme için "Sohbete gönder".'],
    kisa: ['Bir şey silmeyin; gerekirse sohbete gönderin.'], dokunma: 'Kenara alınan .bozuk-*.bak dosyasını silmeyin.', sohbet: 'Eksik kayıt gerekiyorsa ya da tekrar ederse (disk sorunu olabilir).', telegram: /Kayıt dosyası bozuk açıldı/i,
  },
  'mum-db-bozuk': {
    baslik: 'Mum veritabanı bozuktu — kenara alındı, yeniden indiriliyor', ciddiyet: 'gecici', envanter: ['S-099'], kilavuz: 'mum-db-bozuk',
    ciddi: { ton: 'zararsiz', neden: 'Botlar günlük mumu borsadan okur, etkilenmez. Grafik / araştırma / tarama verisi yeniden inene kadar eksik.' },
    gecer: { evet: true, metin: 'Veri orkestratörü açılıştan birkaç dakika sonra yeniden indirir; Pusula yeniden başlayınca kart kalkar.' },
    adimlar: ['Dokunmayın: Pusula boş veritabanıyla açıldı, veri kendiliğinden yeniden iniyor (Veri sayfası).', 'Kenara alınan market.db.bozuk-* dosyasını silmeyin; disk yer sıkıntısı yoksa inceleme için kalsın.'],
    kisa: ['Dokunmayın; veri yeniden iniyor.'], dokunma: 'market.db.bozuk-* dosyasını silmeyin.', sohbet: 'Tekrar ederse (disk sorunu olabilir).', telegram: /Mum veritabanı bozuktu/i,
  },
  'kilit': {
    baslik: 'Sahipsiz güncelleme kilidi', ciddiyet: 'gecici', envanter: ['S04'], kilavuz: 'kilit',
    ciddi: { ton: 'zararsiz', neden: 'Öz denetim sahipsiz kilidi siler.' }, gecer: { evet: true, metin: 'Sonraki yoklamada (5 dk).' }, adimlar: ['Dokunmayın.'], kisa: ['Dokunmayın.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'internet': {
    baslik: 'İnternet kesildi', ciddiyet: 'gecici', envanter: ['S02'], kilavuz: 'internet',
    ciddi: { ton: 'zararsiz', neden: 'Borsaya ve GitHub\'a ulaşılamıyor. Pozisyonlar ve stoplar borsada duruyor.' }, gecer: { evet: true, metin: 'İnternet gelince; kesintinin ne kadar sürdüğü yazılır.' },
    adimlar: ['Modem / elektrik sorununu kontrol edin.'], kisa: ['Modemi kontrol edin; geri gelince haber verilir.'], dokunma: null, sohbet: 'İnternet varken sürerse.', telegram: /internet/i,
  },
  'fiyat-okunamiyor': {
    baslik: 'Borsa fiyatı okunamıyor', ciddiyet: 'gecici', envanter: ['S38'], kilavuz: 'internet',
    ciddi: { ton: 'zararsiz', neden: 'Her yoklamada yeniden deneniyor.' }, gecer: { evet: true, metin: 'Bağlantı gelince.' }, adimlar: ['İnterneti kontrol edin.'], kisa: ['İnterneti kontrol edin.'], dokunma: null, sohbet: '1 saatten uzun sürerse.', telegram: /Fiyat tazeliği|Borsadan fiyat gelmiyor/i,
  },
  'fiyat-sapmasi': {
    baslik: 'Fiyat kaynakları birbirini tutmuyor', ciddiyet: 'gecici', envanter: ['Y-24'], kilavuz: 'guvenli-kip',
    ciddi: { ton: 'zararsiz', neden: 'Binance ile ikinci kaynak arasında %3\'ten fazla fark var; çalışan botlar güvenli kipe alınır.' }, gecer: { evet: true, metin: 'Fark %1\'in altına inince.' }, adimlar: ['Dokunmayın.'], kisa: ['Dokunmayın.'], dokunma: null, sohbet: '2 saatten uzun sürerse.', telegram: null,
  },
  'bakim-suruyor': {
    baslik: 'Binance bakımı sürüyor', ciddiyet: 'gecici', envanter: ['Y-23'], kilavuz: 'guvenli-kip',
    ciddi: { ton: 'zararsiz', neden: 'Bakım penceresinde botlar yeni işlem açmaz.' }, gecer: { evet: true, metin: 'Bakımdan 15 dk sonra.' }, adimlar: ['Dokunmayın.'], kisa: ['Dokunmayın.'], dokunma: null, sohbet: 'Gerekmez.', telegram: /Borsa bakımı/i,
  },
  'bakim-yaklasan': {
    baslik: 'Yaklaşan Binance bakımı 03:02 çalışmasıyla çakışıyor', ciddiyet: 'bilgi', envanter: ['Y-23'], kilavuz: 'guvenli-kip',
    ciddi: { ton: 'zararsiz', neden: 'O sırada botlar güvenli kipte olacak; çalışma bakımdan sonra yapılır.' }, gecer: { evet: true, metin: 'Bakım bitince.' }, adimlar: ['Bir şey yapmayın.'], kisa: ['Bir şey yapmayın.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'kayitci': {
    baslik: 'İleriye veri kaydı: bir kayıtçı yazmıyor', ciddiyet: 'gecici', envanter: ['S37'], kilavuz: 'ileriye-kayit',
    ciddi: { ton: 'zararsiz', neden: 'Yalnız ham araştırma verisi; botları etkilemez. Kaçan saatler geriye doldurulamaz.' }, gecer: { evet: true, metin: 'Kayıtçı 20 dk sonra kendisi yeniden dener.' }, adimlar: ['Dokunmayın; hangi kaynağın düştüğü Veri › İleriye kayıt\'ta.'], kisa: ['Dokunmayın.'], dokunma: null, sohbet: '1 günden uzun sürerse.', telegram: /İleriye veri|kayıtçı/i,
    ekEylem: () => [EY.git('Veri › İleriye kayıt', '#/veri/kayit')],
  },
  // 74.1: Yapay zekâ notları (lib/yapayZeka) — yalnız not; botları, listeyi, kuralları etkilemez.
  'yz-anahtar': {
    baslik: 'Yapay zekâ notları: Gemini API anahtarı bekleniyor', ciddiyet: 'bilgi', envanter: [], kilavuz: 'yapay-zeka-anahtar',
    ciddi: { ton: 'zararsiz', neden: 'Yalnız "Yapay zekâ notları" sayfası boş kalır; botlar, dikkat listesi ve kurallar etkilenmez.' }, gecer: { evet: false, metin: 'Anahtar girilene kadar sürer (istemiyorsanız bu kart yalnız bilgidir).' },
    adimlar: ['aistudio.google.com\'a Google hesabınızla girin › "Get API key" › "Create API key" (ücretsiz; faturalandırma AÇMAYIN).', 'Panel › Ayarlar › Anahtarlar › "Gemini API anahtarı" › Değiştir › anahtarı yapıştırın (acil PIN sorulur).', '"Sına" ile deneyin; ertesi sabah ~07:00\'dan sonra notlar Yapay zekâ notları sayfasında.'],
    kisa: ['Ayarlar › Anahtarlar › Gemini API anahtarı (ücretsiz).'], dokunma: 'Google Cloud\'da faturalandırmayı açmayın — ücretli katmana geçer.', sohbet: 'Gerekmez.', telegram: null,
    ekEylem: () => [EY.git('Anahtarlar', '#/ayarlar/anahtarlar'), EY.git('Yapay zekâ notları', '#/notlar')],
  },
  'yz-calismadi': {
    baslik: 'Yapay zekâ notları bugün okunamadı', ciddiyet: 'bilgi', envanter: [], kilavuz: 'yapay-zeka-hata',
    ciddi: { ton: 'zararsiz', neden: 'Yalnız not sayfası; botlar, liste ve kurallar etkilenmez.' }, gecer: { evet: true, metin: 'Kota dolduysa yarın kendiliğinden; anahtar reddedildiyse anahtar düzelince.' },
    adimlar: ['Karttaki nedeni okuyun.', 'Anahtar reddedildiyse: Ayarlar › Anahtarlar › Gemini API anahtarı › Sına; olmazsa AI Studio\'da yeni anahtar oluşturup Değiştir.', 'Kota dolduysa bir şey yapmayın — yarın kalan konular okunur.'],
    kisa: ['Ayarlar › Anahtarlar › Gemini › Sına.'], dokunma: 'Faturalandırmayı açmayın.', sohbet: '3 gün üst üste sürerse.', telegram: null,
    ekEylem: () => [EY.git('Yapay zekâ notları', '#/notlar'), EY.git('Anahtarlar', '#/ayarlar/anahtarlar')],
  },
  'yz-kanarya': {
    baslik: 'Yapay zekâ notları: kanarya sınaması geçmedi', ciddiyet: 'dikkat', envanter: [], kilavuz: 'yapay-zeka-kanarya',
    ciddi: { ton: 'dikkat', neden: 'Model, sayfaya gömülü sahte bir talimata uydu. O günün notları "güvenilmez" işaretlendi ve Telegram\'a gitmedi. Model hiçbir şeyi değiştiremez (yazma aracı yok).' }, gecer: { evet: true, metin: 'Ertesi gün yeniden sınanır.' },
    adimlar: ['Bugünkü notlara güvenmeyin (sayfada işaretli).', 'Birkaç gün üst üste sürerse geliştirme sohbetine yazın — model sürümü değişmiş olabilir.'],
    kisa: ['Bugünkü notlara güvenmeyin.'], dokunma: null, sohbet: '2 gün üst üste sürerse.', telegram: null,
    ekEylem: () => [EY.git('Yapay zekâ notları', '#/notlar')],
  },
  // 73.9: Piyasa bağlamı (lib/piyasaBaglami) — yalnız bilgi sayfası; kaynak uzun süre alınamazsa bilgi kartı (botları etkilemez).
  'piyasa-bayat': {
    baslik: 'Piyasa bağlamı: bir bilgi kaynağı uzun süredir alınamıyor', ciddiyet: 'bilgi', envanter: [], kilavuz: 'piyasa-baglami-kaynak',
    ciddi: { ton: 'zararsiz', neden: 'Yalnız bilgi sayfası (Piyasa bağlamı); hiçbir gösterge bot kararına girmez. İlgili kart "bayat" ya da "veri yok" der.' }, gecer: { evet: true, metin: 'Kaynak yeniden yanıt verince (toplayıcı kendisi yeniden dener).' },
    adimlar: ['Dokunmayın; hangi kaynağın düştüğü Piyasa bağlamı sayfasının altındaki "Kaynaklar" tablosunda.'], kisa: ['Dokunmayın.'], dokunma: null, sohbet: 'Bir haftadan uzun sürerse (kaynak adresi değişmiş olabilir).', telegram: null,
    ekEylem: () => [EY.git('Piyasa bağlamı', '#/piyasa')],
  },
  'veri-bekleme': {
    baslik: 'Binance hız sınırı — veri güncellemesi bekliyor', ciddiyet: 'gecici', envanter: ['S38'], kilavuz: 'veri-kaynagi',
    ciddi: { ton: 'zararsiz', neden: 'Binance "yavaşla" dedi; süre bitene kadar veri istekleri atılmıyor. Botun kendi işlemleri etkilenmez.' }, gecer: { evet: true, metin: 'Bekleme süresi bitince.' }, adimlar: ['Dokunmayın.'], kisa: ['Dokunmayın.'], dokunma: 'Veri güncellemesini elle zorlamayın.', sohbet: 'Gerekmez.', telegram: /Binance hız sınırı/i,
  },
  'veri-hata': {
    baslik: 'Bir veri kaynağı güncellenemedi', ciddiyet: 'gecici', envanter: ['S38', 'S39'], kilavuz: 'veri-kaynagi',
    ciddi: { ton: 'zararsiz', neden: 'Kaynak geçici hata verdi; sonraki denemede yeniden çekilir. Botun kendi borsa okumaları etkilenmez.' }, gecer: { evet: true, metin: 'Sonraki denemede (gece ya da talep üzerine).' }, adimlar: ['Dokunmayın; ayrıntı Veri › Kaynaklar\'da.'], kisa: ['Dokunmayın.'], dokunma: null, sohbet: '3 gün üst üste sürerse.', telegram: /veri güncellemesi|güncellenemedi/i,
    ekEylem: () => [EY.git('Veri › Kaynaklar', '#/veri/kaynaklar')],
  },
  'veri-kismi': {
    baslik: 'Veri güncel ama bu ayın tam coin evreni henüz yok', ciddiyet: 'bilgi', envanter: ['S17'], kilavuz: 'kismi-evren',
    ciddi: { ton: 'zararsiz', neden: 'Tasarım gereği: aylık arşiv ay bitince gelir; tam evren taramaları son günleri kısmi evrenle görür.' }, gecer: { evet: true, metin: 'Aylık arşiv gelince.' }, adimlar: ['Bir şey yapmayın.'], kisa: ['Bir şey yapmayın.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'ileri-izleyici': {
    baslik: 'İleri test izleyicisi çalışmadı', ciddiyet: 'gecici', envanter: ['S36'], kilavuz: 'ileri-izleyici',
    ciddi: { ton: 'zararsiz', neden: 'Gölge test kayıtları bu denemede yazılmadı (bilgisayar meşgul ya da ağ); 15 dakika sonra yeniden denenir.' }, gecer: { evet: true, metin: '15 dk sonra yeniden denenir.' }, adimlar: ['Dokunmayın.'], kisa: ['Dokunmayın.'], dokunma: null, sohbet: 'Gün boyu sürerse.', telegram: /izleme çalışmadı/i,
  },
  'acil-pin-yok': {
    baslik: 'Acil PIN tanımlı değil — telefondan acil durdurma kapalı', ciddiyet: 'dikkat', envanter: ['S47'], kilavuz: 'acil-pin',
    ciddi: { ton: 'dikkat', neden: 'Uzaktayken telefondan botu durduramazsınız.' }, gecer: { evet: false, metin: 'Hayır.' }, adimlar: ['Sunucuda bir kez `npm run acil-pin`.'], kisa: ['Sunucuda npm run acil-pin.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },
  'acil-pin-kilitli': {
    baslik: 'Acil PIN geçici olarak kilitli (yanlış denemeler)', ciddiyet: 'gecici', envanter: ['S19'], kilavuz: 'acil-pin',
    ciddi: { ton: 'dikkat', neden: 'Çok sayıda yanlış PIN denendi. Siz değilseniz PIN\'inizi değiştirin.' }, gecer: { evet: true, metin: 'Kilit süresi bitince.' }, adimlar: ['Bekleyin.', 'Siz denemediyseniz sunucuda `npm run acil-pin` ile PIN\'i değiştirin.'], kisa: ['Bekleyin; siz değilseniz PIN\'i değiştirin.'], dokunma: null, sohbet: 'Siz denemediyseniz.', telegram: /PIN kilitlendi|acil durdurma kilitlendi/i,
  },
  'gunluk-hata': {
    baslik: 'Son 24 saatte günlükte hata satırları var', ciddiyet: 'bilgi', envanter: ['S14', 'S15'], kilavuz: 'gunluk-hata',
    ciddi: { ton: 'zararsiz', neden: 'Öz denetim sorun görmüyor; tek tük ağ / kaynak hatası olabilir.' }, gecer: { evet: true, metin: '24 saat içinde.' }, adimlar: ['Merak ederseniz Sistem › Günlükler\'de okuyun.'], kisa: ['Acil değil.'], dokunma: null, sohbet: 'Aynı hata sık tekrarlıyorsa.', telegram: /Yakalanmamış Promise|Beklenmeyen bir hata/i,
    ekEylem: () => [EY.git('Günlükler', '#/gunluk')],
  },
  'oz-bekliyor': {
    baslik: 'Öz denetim henüz yoklamadı', ciddiyet: 'gecici', envanter: [], kilavuz: 'sorunlar-sayfasi',
    ciddi: { ton: 'zararsiz', neden: 'Pusula yeni açıldı; ilk yoklama 90 sn içinde.' }, gecer: { evet: true, metin: 'Birkaç dakika içinde.' }, adimlar: ['Bekleyin.'], kisa: ['Bekleyin.'], dokunma: null, sohbet: '10 dakikadan uzun sürerse.', telegram: null,
  },

  // ═══ ARAŞTIRMA KOPYASI (bu bilgisayar) ═══
  'sunucu-ulasilamiyor': {
    baslik: 'Sunucuya ulaşılamıyor — gösterilen, son okunan kopya', ciddiyet: 'dikkat', envanter: ['S02', 'S18'], kilavuz: 'sunucu-sessiz',
    ciddi: { ton: 'dikkat', neden: 'Bu bilgisayar sunucudaki panele ulaşamıyor: sunucu kapalı, uykuda, internetsiz ya da Tailscale bağlı değil. Pozisyonlar ve stoplar borsada duruyor.' }, gecer: { evet: true, metin: 'Bağlantı gelince kendiliğinden.' },
    adimlar: ['Tailscale bu bilgisayarda ve sunucuda "Connected" mı bakın.', 'Telefondan paneli açmayı deneyin; açılmıyorsa kılavuzdaki "Sunucu sessiz" karar ağacını izleyin.', 'Açık pozisyon varsa acele etmeyin: stoplar borsada; gerekirse Binance uygulamasından bakın.'], kisa: ['Tailscale bağlı mı bakın; kılavuzdaki "Sunucu sessiz" karar ağacını izleyin.'], dokunma: null, sohbet: 'Sunucu açık ve Tailscale bağlıyken sürerse.', telegram: null,
  },
  'sunucu-jeton': {
    baslik: 'Sunucu bu bilgisayarın jetonunu reddediyor (401 / 403)', ciddiyet: 'mudahale', envanter: ['S18'], kilavuz: 'sunucu-baglantisi',
    ciddi: { ton: 'dikkat', neden: 'Sunucu açık ama jeton yanlış / eskimiş; bu bilgisayardaki görünüm eski kalır, yazmalar kuyrukta bekler.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Sunucuda `npm run telefon-jeton` (okuma) ya da `npm run gelistirme-jeton -- --yeni` (yazma).', 'Bu bilgisayarda `npm run sunucu-baglanti -- --adres … --jeton …` ile yeniden kaydedin (Kılavuz › Kurulum).'], kisa: ['Jetonu sunucuda yenileyip bu bilgisayarda yeniden kaydedin.'], dokunma: null, sohbet: 'Yeni jetonla da olmuyorsa.', telegram: null,
  },
  'sunucu-ayar-bozuk': {
    baslik: 'Sunucu bağlantı ayarı okunamıyor', ciddiyet: 'mudahale', envanter: ['S18', 'S33'], kilavuz: 'sunucu-baglantisi',
    ciddi: { ton: 'dikkat', neden: 'data\\ev-baglanti.json eski şifreli ya da geçersiz; bu bilgisayar sunucuyu değil yerel eski kopyayı gösteriyor.' }, gecer: { evet: false, metin: 'Hayır.' },
    adimlar: ['Bu bilgisayarda `npm run sunucu-baglanti -- --adres … --jeton …` ile yeniden kaydedin.'], kisa: ['Sunucu bağlantısını yeniden kaydedin.'], dokunma: null, sohbet: 'Gerekirse.', telegram: null,
  },
  'ev-kuyruk': {
    baslik: 'Sunucuya henüz ulaşmamış yazmalar kuyrukta', ciddiyet: 'gecici', envanter: ['S18'], kilavuz: 'sunucu-baglantisi',
    ciddi: { ton: 'zararsiz', neden: 'İşlem defterim / Portföyüm yazmaları sunucuya ulaşınca gönderilir.' }, gecer: { evet: true, metin: 'Sunucu bağlantısı gelince.' }, adimlar: ['Dokunmayın; Ayarlar › Bu bilgisayar › Kuyruk\'tan elle de gönderebilirsiniz.'], kisa: ['Dokunmayın.'], dokunma: null, sohbet: 'Kuyruk "reddetti (403)" diyorsa.', telegram: null,
  },
  'sunucu-eski': {
    baslik: 'Sunucudaki Pusula sorun merkezini henüz tanımıyor', ciddiyet: 'bilgi', envanter: [], kilavuz: 'sorunlar-sayfasi',
    ciddi: { ton: 'zararsiz', neden: 'Sunucu 73.7\'den eski; sunucunun sorunları sunucu güncellenince burada görünür.' }, gecer: { evet: true, metin: 'Sunucu güncellenince.' }, adimlar: ['Sunucuda güncellemeyi kurun (Ayarlar › Güncelleme).'], kisa: ['Sunucuyu güncelleyin.'], dokunma: null, sohbet: 'Gerekmez.', telegram: null,
  },

  // ═══ TANINMAYAN (asla sessiz kalma) ═══
  'taninmayan': {
    baslik: 'Tanınmayan sorun: {ad}', ciddiyet: 'dikkat', envanter: [], kilavuz: 'taninmayan',
    ciddi: { ton: 'dikkat', neden: 'Pusula bu durumu tanıyor ama Sorun merkezi henüz açıklamasını bilmiyor.' }, gecer: { evet: false, metin: 'Bilinmiyor.' },
    adimlar: ['Aşağıdaki ham metni okuyun.', '"Sohbete gönder" ile geliştirme sohbetine iletin — bu durum için açıklama eklenecek.'], kisa: ['Panel › Sorunlar\'daki "Sohbete gönder" ile geliştirme sohbetine iletin.'], dokunma: 'Ne olduğunu bilmeden botu açmayın / kapatmayın.', sohbet: 'Her zaman.', telegram: null,
  },
};
for (const [k, v] of Object.entries(KATALOG)) v.kimlik = k;

/** Telegram eşleştirme sırası: önce özgül, sonra genel desenler. */
const TELEGRAM_SIRA = ['guncelleme-imzasiz', 'bot-felaket-stopu', 'bot-stop-kurulamadi', 'bot-emir-reddi', 'bot-dongu-coktu', 'bot-emir-freni', 'bot-hesap-kesicisi', 'bot-uygulama-sapmasi', 'bot-durum-dosyasi',
  'bot-coklu-varlik', 'bot-yatirma-kabul', 'bot-para-reddedildi', 'bot-para-cikisi', 'bot-para-girisi', 'bot-kol-uyusmazlik', 'bot-kapi', 'gk-bakim', 'gk-fiyat', 'gk-stop-vurus', 'gk-tekrar', 'yurutucu-geri-cekilme', 'yurutucu-belirsiz', 'yurutucu-elle', 'bot-bagli-degil',
  'bot-canli-onay', 'bot-zorla', 'bot-marj', 'bot-ileri-dur', 'bot-sapma-incele', 'gk-veri', 'veri-kalitesi', 'bot-veri-kapisi', 'bot-kalp', 'bot-stop-uyari', 'bot-donma-takildi', 'bot-tekrar-haber', 'bot-kacan', 'guncelleme-yarida', 'guncelleme-elle',
  'guncelleme-geri-alindi', 'guncelleme-onay', 'guncelleme-yeniden-baslat', 'guncelleme-github', 'cokme-dongusu', 'acilis-sayaci', 'donma-oldu', 'disk', 'saat', 'mum-db-bozuk', 'kayit-dosyasi-bozuk', 'dosya-bozuk', 'acil-pin-kilitli', 'ileri-izleyici',
  'veri-bekleme', 'kayitci', 'fiyat-okunamiyor', 'bakim-suruyor', 'internet', 'yedek', 'gunluk-hata', 'bot-delist', 'veri-hata', 'anahtar-cekme-izni'];

// ── Kart kurucu ────────────────────────────────────────────────────────────────
const doldurMetin = (s, deg) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (deg[k] != null ? String(deg[k]) : ''));
const kirp = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/**
 * @param tur KATALOG anahtarı · @param o { bot, botAd, ne, ciddiyet?, ciddiNeden?, kalkis?, gecerMetin?, neyiSaydi?, eylemler?, ham?, deg?, kaynak? }
 * @returns kart (JSON'a uygun düz nesne)
 */
function kart(tur, o = {}, simdi = Date.now()) {
  const k = KATALOG[tur] || KATALOG.taninmayan;
  const deg = { bot: o.botAd || o.bot || '', ...(o.deg || {}) };
  const kalkis = Number.isFinite(o.kalkis) ? o.kalkis : null;
  const ciddiyet = o.ciddiyet || k.ciddiyet;
  const eylemler = [...(o.eylemler || []), ...(k.ekEylem ? k.ekEylem(o.bot) : [])];
  const gorulen = new Set();
  const tekil = eylemler.filter(e => { if (!e || gorulen.has(e.kimlik)) return false; gorulen.add(e.kimlik); return true; });
  return {
    kimlik: `${k.kimlik}${o.bot ? ':' + o.bot : ''}${o.ek ? ':' + o.ek : ''}`, tur: k.kimlik, bot: o.bot || null, botAd: o.botAd || null, kaynak: o.kaynak || 'sunucu',
    baslik: kirp(doldurMetin(o.baslik || k.baslik, deg), 160), ciddiyet, ciddiyetAd: CIDDIYET_AD[ciddiyet],
    ne: kirp(o.ne || '', 400),
    ciddi: { ton: o.ciddiTon || k.ciddi.ton, tonAd: TON_AD[o.ciddiTon || k.ciddi.ton], neden: o.ciddiNeden || k.ciddi.neden },
    gecer: { evet: o.gecerEvet != null ? !!o.gecerEvet : !!k.gecer.evet, metin: o.gecerMetin || k.gecer.metin, kalkis, kalkisMetin: kalkis != null ? kalkisMetni(kalkis, simdi) : null },
    adimlar: (o.adimlar || k.adimlar).slice(0, 5), kisa: (o.kisa || k.kisa).slice(0, 3),
    dokunma: o.dokunma !== undefined ? o.dokunma : k.dokunma, eylemler: tekil,
    neyiSaydi: o.neyiSaydi || null, kilavuz: KLV(k.kilavuz), kilavuzId: k.kilavuz,
    sohbet: k.sohbet || SOHBET_GENEL, envanter: k.envanter || [], ham: o.ham ? kirp(o.ham, 600) : null,
  };
}

// ── Sınıflandırıcılar ──────────────────────────────────────────────────────────
/** Saf: ENGEL metni → katalog türü (bilinmeyen → null). `kol`: kol (Kalkan) engeli mi. */
function engelTuru(metin, { kol = false, stopTetik = false } = {}) {
  const m = String(metin || '');
  if (/emirleri? .*reddetti|emir.* reddedildi.*kez/i.test(m)) return 'bot-emir-reddi';
  if (/koruma stopu art arda|stop kurulamadı/i.test(m)) return 'bot-stop-kurulamadi';
  if (/bot döngüsü .*hata verdi/i.test(m)) return 'bot-dongu-coktu';
  if (/EMİR FRENİ/.test(m)) return 'bot-emir-freni';
  if (/durum dosyası bozuk/i.test(m)) return 'bot-durum-dosyasi';
  if (/uygulama sapması/i.test(m)) return 'bot-uygulama-sapmasi';
  if (/hesap kesicisi/i.test(m)) return 'bot-hesap-kesicisi';
  if (/ileri test DUR/i.test(m)) return 'bot-ileri-dur';
  if (/çoklu varlık|botun olmayan bakiye|vadeli \S+ teminatı|çözülmemiş belirsiz akış/i.test(m)) return 'bot-coklu-varlik';
  if (/pozisyon uyuşmazlığı|DCA emrinin durumu çözülemedi|≠/.test(m)) return stopTetik ? 'bot-felaket-stopu' : 'bot-kol-uyusmazlik';
  if (/^yürütücü \S+:/.test(m) || /yürütücü (DURDURULDU|BAGLI_DEGIL)/.test(m)) return 'yurutucu-elle';
  if (/gerçek para kapısı/i.test(m)) return 'bot-kapi';
  if (kol) return 'bot-kol-uyusmazlik';
  return null;
}
/** Saf: güvenli kip { kaynak, metin } → katalog türü (bilinmeyen → null). */
function gkTuru(g) {
  if (!g) return null;
  const k = String(g.kaynak || ''), m = String(g.metin || '');
  if (k === 'oz:bakim' || /Binance bakımı/i.test(m)) return 'gk-bakim';
  if (k === 'oz:fiyat' || /fiyat iki kaynakta/i.test(m)) return 'gk-fiyat';
  if (k === 'oz:stopVurus' || /felaket stopu tetiklendi/i.test(m)) return 'gk-stop-vurus';
  if (k === 'oz:tekrar' || /aynı hata/i.test(m)) return 'gk-tekrar';
  if (k === 'veri' || /^veri kalitesi:/i.test(m)) return 'gk-veri';   // 74.3 D4 (botun kendi kapısı)
  if (k === 'elle') return 'gk-elle';   // 77.x "Güvenli kipe al" aracı
  return null;
}
/** 73.8 (Y-43) saf: çoklu varlık engel metni → alt tür (lib/live/cokluVarlik.js mutabakat metinleri) | null. */
function cokluAltTur(metin) {
  const m = String(metin || '');
  if (/çoklu varlık modu KAPALI/i.test(m)) return 'mod-kapali';
  if (/botun olmayan bakiye/i.test(m)) return 'yabanci-bakiye';
  if (/teminatı .*≠ beklenen/i.test(m)) return 'vadeli-fark';
  if (/çözülmemiş belirsiz akış/i.test(m)) return 'belirsiz-akis';
  if (/çoklu varlık okunamadı/i.test(m)) return 'okunamadi';
  return null;
}
/** Saf: "pozisyon uyuşmazlığı: HYPE borsa 12 ≠ 10 + 0 · SUI borsa 3 ≠ 3 + 1" → tablo satırları. */
function uyusmazlikTablosu(metin) {
  const l = [];
  for (const m of String(metin || '').matchAll(/([A-Z0-9]+) borsa (-?[\d.]+) ≠ (-?[\d.]+) \+ (-?[\d.]+)(?: \+ (-?[\d.]+))?/g)) {
    const borsa = +m[2], don = +m[3], dca = +m[4], ek = m[5] != null ? +m[5] : 0;
    l.push([m[1], String(borsa), String(don), String(dca), String(+(borsa - don - dca - ek).toFixed(8))]);
  }
  return l.length ? { basliklar: ['Coin', 'Borsada', 'Trend kolu kaydı', 'Kademeli alım kaydı', 'Fark'], satirlar: l } : null;
}
/** Saf: emir ret kayıtları → "Neyi saydı?" satırları (zaman TR + kod + metin + sözlük açıklaması). */
function retSatirlari(retler, simdi) {
  return (retler || []).slice(-10).map(r => {
    const a = H.aciklama(r.kod || r.metin);
    const sinif = r.sinif || (a ? a.ton : null);
    return `${trSaat(r.zaman, simdi)} · ${r.kod || 'kodsuz'} · ${kirp(r.metin, 140)}${a ? ` → ${a.anlam} (${sinif === 'kod-hatasi' ? 'KOD HATASI' : sinif === 'zararsiz' ? 'zararsız' : sinif || 'dikkat'})` : ''}`;
  });
}

/**
 * 77.8 Saf: devralma ekranı (lib/makine/devralma.js liste()) → kartlar. "Makine sessiz" — eşlenmiş SUNUCU sessiz ve kopyası burada (bot başına
 * telefondan devral aracı, yalnız telefonda görünür); "devralındı — emir listesi onayı" (demo, SAHİPLEN); "devralındı — Başlat bir kez".
 */
function devralmaKartlari(dv, rol, ekle, simdi) {
  if (!dv || dv.rol !== 'sunucu' || rol === 'arastirma') return;
  const devralinan = new Map((dv.devralinanlar || []).map(d => [d.kimlik, d]));
  for (const es of dv.esler || []) {
    if (!es || !es.sessiz || !es.kopya || !es.kopya.var) continue;
    const botlar = es.botlar || [];
    const kalan = botlar.filter(b => !(devralinan.get(b.kimlik) && devralinan.get(b.kimlik).kaynak === es.kimlik));
    if (botlar.length && !kalan.length) continue;   // o makinenin bütün botları zaten buraya devralındı
    const uygun = kalan.filter(b => b.devralinabilir);
    const degil = kalan.filter(b => !b.devralinabilir);
    const sure = Number.isFinite(es.sessizDk) ? (es.sessizDk < 120 ? `${es.sessizDk} dk` : `${Math.floor(es.sessizDk / 60)} sa ${es.sessizDk % 60} dk`) : '?';
    const ne = [`${es.ad}: ${sure} ses yok${es.sonTemas ? ` (son temas ${trSaat(Date.parse(es.sonTemas), simdi)})` : ''} · son kopya ${Number.isFinite(es.kopya.yasDk) ? `${es.kopya.yasDk} dk önce` : '—'}.`,
      uygun.length ? `Devralınabilir: ${uygun.map(b => `${b.adGorunen || b.kimlik} (${b.mod === 'demo' ? 'demo' : b.mod === 'kagit' ? 'kâğıt' : b.mod})`).join(', ')}.` : 'Bu kopyada devralınabilir bot yok.',
      degil.length ? `Devralınamaz: ${degil.map(b => `${b.adGorunen || b.kimlik} — ${kirp(b.neden || '?', 90)}`).join(' · ')}.` : null].filter(Boolean).join(' ');
    ekle('makine-sessiz', { ek: es.kimlik, deg: { makine: es.ad }, ne,
      eylemler: uygun.slice(0, 6).map(b => ({ ...EY.arac('devral', b.kimlik, `${b.adGorunen || b.kimlik}: bu sunucuya devral (PIN)…`), kimlik: `arac:devral:${es.kimlik}:${b.kimlik}`, api: { tur: 'sorunArac', arac: 'devral', bot: b.kimlik, es: es.kimlik }, yalnizTelefon: true })) });
  }
  for (const d of dv.devralinanlar || []) {
    if (!d || d.asama !== 'geldi') continue;
    const ad = d.adGorunen || d.kimlik;
    const kaynak = d.kaynakAd || d.kaynak || 'öteki makine';
    const m = d.mutabakat || 'bekliyor';
    if (d.mod === 'demo' && ['bekliyor', 'sahiplen-bekliyor', 'elle'].includes(m)) {
      const s = d.sahiplen || null;
      ekle('devralma-sahiplen', { bot: d.kimlik, botAd: ad, ne: `${ad} ${kaynak} makinesinden devralındı (nöbet ${d.nobet}). ${s && !s.hata ? `Borsada bu defterin bilmediği ${(s.acik || []).length} açık + ${(s.kapanmis || []).length} kapanmış bizim emrimiz var.` : s && s.hata ? `Emir listesi okunamadı: ${kirp(s.hata, 140)}.` : 'Borsadaki emir listesi alınıyor.'} Onaydan önce Mutabakat ve Başlat kapalı.`,
        eylemler: [{ ...EY.arac('devral-sahiplen', d.kimlik, 'Emir listesini onayla (PIN)…'), yalnizTelefon: true }, EY.acil(d.kimlik)] });
    } else if (d.telefonBaslat && m === 'temiz') {
      ekle('devralma-baslat', { bot: d.kimlik, botAd: ad, ne: `${ad} ${kaynak} makinesinden devralındı (nöbet ${d.nobet}); borsayla karşılaştırma TEMİZ. Bot kendiliğinden başlamaz.${d.telefonBaslatBitis ? ` Telefondan Başlat ${trSaat(Date.parse(d.telefonBaslatBitis), simdi)}'e kadar açık.` : ''}`,
        eylemler: [{ ...EY.arac('devral-baslat', d.kimlik, 'Başlat (PIN, bir kez)…'), yalnizTelefon: true }, botSayfasi(d.kimlik)] });
    }
  }
}

// ── ÜRETİM ─────────────────────────────────────────────────────────────────────
/**
 * Saf: girdi → { sorunlar: [kart], sayac, sonDenetim, calisiyor }. Girdi alanlarının hepsi isteğe bağlı (yoksa o kaynak atlanır).
 * @param g { simdi, oz: { calisiyor, goruntu, veri }, botlar: [...], guncelleme, veri, ileri, acilPin, telefonJeton, tasimaBekliyor,
 *            donma, gunluk: { hata }, saatDilimi, yerel: { evBaglanti, evKuyruk, sunucuSorunlari } }
 */
function uret(g = {}) {
  const simdi = Number.isFinite(g.simdi) ? g.simdi : Date.now();
  const l = [];
  const ekle = (tur, o) => l.push(kart(tur, o, simdi));
  const oz = g.oz || {};
  const go = oz.goruntu || null;
  const ov = oz.veri || {};
  const botlar = Array.isArray(g.botlar) ? g.botlar : [];
  const botAd = (ad) => { const b = botlar.find(x => x.ad === ad) || ((go && go.botlar) || []).find(x => x.ad === ad); return (b && (b.adGorunen || b.ad)) || ad; };
  /** Bot kartı üretilen (bot, kapsam) çiftleri — öz denetim satırları bunları ikinci kez üretmesin. */
  const kapsanan = new Set();
  const kapsa = (bot, ne) => kapsanan.add(`${bot}|${ne}`);
  const kapsandi = (bot, ne) => kapsanan.has(`${bot}|${ne}`);

  // ── 1. Botların kendi durumu (ENGEL, güvenli kip, yürütücü, risk) ──
  for (const b of botlar) {
    const ad = b.ad, gor = b.adGorunen || ad;
    const v = (ov.botlar || {})[ad] || {};
    const y = b.yurutucu || {};
    const engel = b.bindirmeEngel || null, kolE = b.kolEngel || null;
    const engelMetin = engel || kolE;
    if (engelMetin) {
      const stopTetik = Number.isFinite(v.stopSonVurus) && simdi - v.stopSonVurus < GUN;
      let tur = engelTuru(engelMetin, { kol: !engel && !!kolE, stopTetik });
      const eylemler = [];
      let neyiSaydi = null;
      const tk = v.tk && v.tk.zaman ? v.tk : null;
      if (tur === 'bot-emir-reddi') {
        const satir = tk && tk.satirlar && tk.satirlar.length ? retSatirlari(tk.satirlar, simdi) : [];
        neyiSaydi = { baslik: `Kapanmaya yol açan ret satırları${satir.length ? ` (${satir.length})` : ''}`, satirlar: satir.length ? satir : ['Sayılan satırlar bu sürümden önce kaydedilmedi — Sağlık › Olay raporları › son dosyada "reddedildi" satırlarına bakın.'] };
      } else if ((tur === 'bot-dongu-coktu' || tur === 'bot-stop-kurulamadi') && tk && tk.satirlar) {
        neyiSaydi = { baslik: tur === 'bot-dongu-coktu' ? 'Son döngü hataları' : 'Son stop denetimi hataları', satirlar: tk.satirlar.slice(-5).map(x => (typeof x === 'string' ? kirp(x, 200) : `${trSaat(x.zaman, simdi)} · ${kirp(x.metin, 180)}`)) };
      } else if (tur === 'bot-kol-uyusmazlik' || tur === 'bot-felaket-stopu') {
        // 73.8 (Y-09b): sunucunun açıklayıcısı (son emirler, son dolum, stop / ADL olayı, olası neden) varsa o; yoksa ENGEL metninden tablo
        const ac = b.uyusmazlikAciklama && Array.isArray(b.uyusmazlikAciklama.satirlar) && b.uyusmazlikAciklama.satirlar.length ? b.uyusmazlikAciklama : null;
        const t = ac || uyusmazlikTablosu(engelMetin);
        neyiSaydi = t ? { baslik: ac ? 'Coin başına borsa / kayıt farkı ve olası neden' : 'Coin başına borsa / kayıt farkı', tablo: t, satirlar: [] } : { baslik: 'Uyuşmazlık metni', satirlar: [kirp(engelMetin, 300)] };
        if (stopTetik) neyiSaydi.satirlar.push(`Son felaket stopu vuruşu: ${trSaat(v.stopSonVurus, simdi)}`);
        // 73.8 (Y-03/Y-33): coin başına "Kaydı borsaya eşitle" (önizleme uygulanabilir mi der; elle işlem / gecikmeli dolumda uygulanmaz)
        for (const r of ((t && t.satirlar) || []).slice(0, 4)) eylemler.push(EY.arac('kayit-esitle', ad, `Kaydı borsaya eşitle (${r[0]})…`, r[0]));
      } else if (tur === 'bot-emir-freni' && b.frenNeyiSaydi) neyiSaydi = b.frenNeyiSaydi;   // 73.8 (Y-14)
      let altAdim = null;
      if (tur === 'bot-coklu-varlik') {   // 73.8 (Y-43): alt tür → adımlar + doğru düğme
        const alt = cokluAltTur(engelMetin);
        const at = alt && KATALOG['bot-coklu-varlik'].altTurler[alt];
        if (at) { altAdim = at.adimlar; neyiSaydi = { baslik: `Alt tür: ${at.ad}`, satirlar: [kirp(engelMetin, 300)] }; }
        if (alt === 'yabanci-bakiye') eylemler.push(EY.arac('yatirma-kabul', ad, 'Yatırmayı kabul et…'));
      }
      if (tur === 'bot-kol-uyusmazlik' || tur === 'bot-felaket-stopu' || tur === 'bot-durum-dosyasi' || tur === 'yurutucu-elle' || tur === 'bot-coklu-varlik' || tur === 'bot-emir-reddi') eylemler.push(...EY.mutabakatlar(ad));
      if (engel && tur !== 'bot-kol-uyusmazlik' && tur !== 'bot-felaket-stopu' && !(tur === 'bot-coklu-varlik' && cokluAltTur(engelMetin) === 'yabanci-bakiye')) eylemler.push(EY.engelKaldir(ad, tur === 'bot-coklu-varlik' ? 'Engeli kaldır (kendi işlemimdi)' : null));
      eylemler.push(botSayfasi(ad), EY.acil(ad));
      const ortak = { bot: ad, botAd: gor, ne: `Bot ${b.calisiyor ? 'yeni emir vermiyor' : 'durdu'} — sebep: ${engelMetin}`, neyiSaydi, eylemler, ham: engelMetin, ...(altAdim ? { adimlar: altAdim } : {}) };
      if (b.dokunulmaz || v.dokunulmaz) ortak.ne += ' (demo kabul: bu durumu öz denetim değil botun kendi kuralı koydu)';
      if (!tur) ekle('taninmayan', { ...ortak, deg: { ad: `${gor} durdu` } });
      else ekle(tur, ortak);
      kapsa(ad, 'engel');
    }
    if (b.guvenliKip) {
      const gk = b.guvenliKip;
      const tur = gkTuru(gk);
      const o = { bot: ad, botAd: gor, ne: `Yeni işlem açılmıyor (${trSaat(gk.zaman, simdi)}'den beri) — ${gk.metin}`, eylemler: [EY.gkKaldir(ad), EY.gkCik(ad), botSayfasi(ad)], ham: gk.metin };
      if (tur === 'gk-bakim') {
        const bit = ov.bakimAktif && Number.isFinite(ov.bakimAktif.bit) ? ov.bakimAktif.bit + ((ov.ayar && ov.ayar.bakimSonraMs) || 15 * DK) : null;
        o.kalkis = bit;
        if (bit == null) o.gecerMetin = 'Evet — bakım bitince 15 dk sonra (bitiş saati duyuruda yok).';
        o.eylemler = [botSayfasi(ad), EY.gkCik(ad)];   // 77.x: telefonda tek imkân — önizleme "beklemek daha doğru" der
      } else if (tur === 'gk-fiyat') {
        o.ne += Number.isFinite(ov.fiyatSapma) ? ` · şu anki fark %${(ov.fiyatSapma * 100).toFixed(2).replace('.', ',')}` : '';
        o.eylemler = [botSayfasi(ad), EY.gkCik(ad)];   // 77.x: telefonda tek imkân — önizleme "beklemek daha doğru" der
      } else if (tur === 'gk-stop-vurus') {
        o.kalkis = Number.isFinite(v.stopSonVurus) ? v.stopSonVurus + ((ov.ayar && ov.ayar.stopVurusPencereMs) || GUN) : null;
        o.eylemler = [botSayfasi(ad), EY.gkCik(ad)];   // 77.x: telefonda tek imkân — önizleme "beklemek daha doğru" der
      } else if (tur === 'gk-tekrar') {
        const t = (v.tekrarlar || [])[0];
        const ornek = (t && t.ornek) || gk.metin;
        const kodHata = KOD_HATASI_RE.test(ornek);
        o.kalkis = kodHata ? null : (Number.isFinite(v.sonTekrar) ? v.sonTekrar : gk.zaman) + ((ov.ayar && ov.ayar.tekrarKalkMs) || 60 * DK);
        if (kodHata) { o.ciddiyet = 'dikkat'; o.gecerEvet = false; o.gecerMetin = 'Büyük olasılıkla HAYIR — hata metni bir kod hatasına benziyor; geliştirme sohbetine yazın.'; }
        o.neyiSaydi = { baslik: 'Tekrarlayan satır', satirlar: [(t ? `${t.adet} kez / 30 dk · ` : '') + kirp(ornek, 220)] };
      }
      if (!tur) ekle('taninmayan', { ...o, deg: { ad: `${gor} güvenli kipte` } });
      else ekle(tur, o);
      kapsa(ad, 'gk');
    }
    // Yürütücü (bağlantı): ENGEL yoksa ayrı kart (ENGEL metni zaten yürütücüyü anlatıyorsa tek kart).
    if (y.durum === 'DURDURULDU' && !kapsandi(ad, 'engel')) {
      const tr = y.durmaTuru;
      const o = { bot: ad, botAd: gor, ne: `Yürütücü durdu [${tr || '?'}]: ${y.durmaSebebi || '—'}`, ham: y.durmaSebebi };
      if (tr === 'GERI_CEKILME') { o.kalkis = y.geriCekilme && Number.isFinite(+y.geriCekilme.bitis) && +y.geriCekilme.bitis > 0 ? +y.geriCekilme.bitis : null; o.eylemler = [botSayfasi(ad)]; ekle('yurutucu-geri-cekilme', o); }
      else if (tr === 'BELIRSIZ') { o.kalkis = simdi + 5 * DK; o.gecerMetin = 'Evet — 5 dakikada bir kendisi sorar (tahmini saat bir sonraki soruştur).'; o.eylemler = [...EY.mutabakatlar(ad), botSayfasi(ad)]; ekle('yurutucu-belirsiz', o); }
      else {
        const kod = H.aciklama(y.durmaSebebi);
        if (kod) o.neyiSaydi = { baslik: 'Hata kodu', satirlar: [`${kod.kod} → ${kod.anlam} · ${kod.neYapmali}`] };
        o.eylemler = [...EY.mutabakatlar(ad), botSayfasi(ad), EY.acil(ad)];
        ekle('yurutucu-elle', o);
      }
      kapsa(ad, 'baglanti');
    }
    if (b.akisBekleyen && !kapsandi(ad, 'yatirma')) {
      const t = b.akisBekleyen;
      ekle('bot-yatirma-kabul', { bot: ad, botAd: gor, ne: `Spot cüzdana ${t.tutar != null ? `${t.tutar} USDT` : 'para'} yatırıldı${(t.notlar || []).length ? ` (${t.notlar.join(', ')})` : ''}; kabul edilene kadar ölçüm tabanına işlenmez.`, eylemler: [EY.arac('yatirma-kabul', ad, 'Yatırmayı kabul et…'), botSayfasi(ad)] });   // 73.8 (Y-44): ayrı araç — engel / fren kalkmaz
      kapsa(ad, 'yatirma');
    }
    // Para akışı onayı (2026-10-25): bekleyen çıkış → müdahale (bot durdu); yalnız giriş → dikkat (bot sürüyor, giriş hesaba katılmıyor).
    const pa = b.paraAkisi || null;
    if (pa && Array.isArray(pa.bekleyen) && pa.bekleyen.length && !kapsandi(ad, 'para')) {
      const cik = pa.bekleyen.filter(x => x.tutar < 0), gir = pa.bekleyen.filter(x => x.tutar > 0);
      const t = (l) => l.map(x => `${x.tutar > 0 ? '+' : ''}${(+x.tutar).toFixed(2)} USDT${x.not ? ` (${kirp(x.not, 60)})` : ''}`).join(', ');
      const ret = cik.filter(x => x.ret), retsiz = cik.filter(x => !x.ret);
      const eylemler = [EY.arac('para-akisi-onay', ad, 'Para hareketini onayla…'), botSayfasi(ad)];
      // 76.4 "Bu ben değilim": reddedilen çıkış → kırmızı güvenlik kartı (bot durmuş kalır); onay ancak bilinçli (aynı araç).
      if (ret.length) ekle('bot-para-reddedildi', { bot: ad, botAd: gor, ne: `"Bu ben değilim" dediğiniz para çıkışı: ${t(ret)} — reddedildi — güvenlik, hesaplara katılmadı.${retsiz.length ? ` Ayrıca onay bekleyen çıkış: ${t(retsiz)}.` : ''}${gir.length ? ` · bekleyen giriş: ${t(gir)}` : ''} Bot durmuş kalıyor; açık pozisyon ve felaket stopları yerinde.`,
        eylemler: [...(retsiz.length ? [EY.arac('para-akisi-reddet', ad, 'Bu ben değilim — reddet…')] : []), EY.arac('para-akisi-onay', ad, 'Hareket benimmiş — onayla…'), botSayfasi(ad)] });
      else if (cik.length) ekle('bot-para-cikisi', { bot: ad, botAd: gor, ne: `Borsada onaysız para çıkışı: ${t(cik)}${gir.length ? ` · bekleyen giriş: ${t(gir)}` : ''}. Bot yeni işlem açmıyor; açık pozisyon ve felaket stopları yerinde.`, eylemler: [eylemler[0], EY.arac('para-akisi-reddet', ad, 'Bu ben değilim — reddet…'), eylemler[1]] });
      else ekle('bot-para-girisi', { bot: ad, botAd: gor, ne: `Borsada para girişi: ${t(gir)}; onaylanana kadar hesaba katılmıyor (bot eski bakiyeyle sürüyor).`, eylemler });
      kapsa(ad, 'para');
    }
    if (b.model && b.model.durum === 'DUR' && !kapsandi(ad, 'engel')) ekle('bot-ileri-dur', { bot: ad, botAd: gor, ne: b.model.metin || 'İleri test DUR göstergesi', eylemler: [EY.git('İleri test', '#/ileri/hucum-denge'), botSayfasi(ad)] });
    if (b.uygulama && b.uygulama.bant === 'incele' && !kapsandi(ad, 'engel')) ekle('bot-sapma-incele', { bot: ad, botAd: gor, ne: b.sapmaMetin || 'Gerçek sonuç simülasyondan %3 bandının dışında.', eylemler: [EY.git('İleri test', '#/ileri/hucum-denge')] });
    const kalp = b.kalp || null, kd = b.kalpDurumu || {};
    if (b.calisiyor && kd.gecikti && !engelMetin && !b.guvenliKip && !(pa && pa.durdurma)) ekle('bot-kalp', { bot: ad, botAd: gor, ne: `${kd.metin || 'son çalışma 26 saatten eski'}${kalp && kalp.hata ? ` · son hata: ${kalp.hata}` : ''}`, eylemler: [EY.git('Günlükler', '#/gunluk'), botSayfasi(ad)] });
    else if (b.calisiyor && kalp && kalp.hata && Number.isFinite(kalp.zaman) && simdi - kalp.zaman < 3 * SAAT && !engelMetin && !b.guvenliKip && !(pa && pa.durdurma)) {
      if (/veri kapısı/i.test(kalp.hata)) ekle('bot-veri-kapisi', { bot: ad, botAd: gor, ne: kirp(kalp.hata, 300), kalkis: kalp.zaman + 15 * DK, eylemler: [botSayfasi(ad)] });
      else if (/gerçek para kapısı/i.test(kalp.hata)) ekle('bot-kapi', { bot: ad, botAd: gor, ne: kirp(kalp.hata, 300), eylemler: [EY.git('Ayarlar › Botlar', '#/ayarlar/botlar')] });
    }
    // 73.8 (Y-04): canlı risk dosyası (riskDurum) varsa o — elle sıfırlanınca kart hemen kalkar; yoksa son karar
    const risk = b.riskDurum || (b.sonKarar && b.sonKarar.risk);
    if (risk && Number(risk.kill) >= 3) ekle('bot-k3', { bot: ad, botAd: gor, ne: `${b.riskDurum ? `Zarar sınırı mandalı K${risk.kill}${risk.killZamani ? ` (${trSaat(+risk.killZamani, simdi)}'den beri)` : ''}${risk.killNedeni ? ` — ${kirp(risk.killNedeni, 140)}` : ''}` : `Son karar (${(b.sonKarar && b.sonKarar.gun) || '—'}): kill seviyesi ${risk.kill}`} — coin sepeti ve BTC hedefi sıfırda.`, eylemler: [botSayfasi(ad)] });
    if (b.mod === 'canli' && b.calisiyor && y.kilitAcik === false) ekle('bot-canli-onay', { bot: ad, botAd: gor, ne: 'Canlı hesapta emir onayı kapalı; bot emir vermiyor.', eylemler: [EY.git('Ayarlar › Botlar', '#/ayarlar/botlar')] });
  }

  // ── 2. Öz denetim denetimleri ──
  if (oz.calisiyor && go && !go.ozet.sonYoklama) ekle('oz-bekliyor', { ne: 'Pusula açıldıktan sonraki ilk yoklama bekleniyor.' });
  const denetimler = (go && go.denetimler) || [];
  const sorunlu = (d) => d.durum === 'uyari' || d.durum === 'hata';
  /** Bot başına denetim satırı işleyicisi: (botAd, x {durum, ayrinti}) → kart ya da null (kapsandı). */
  const botBasina = (d, fn) => {
    const bl = d.botlar && Object.keys(d.botlar).length ? d.botlar : null;
    if (!bl) { if (sorunlu(d)) fn(null, d); return; }
    for (const [ad, x] of Object.entries(bl)) if (sorunlu(x)) fn(ad, x);
  };
  const B = (ad) => ({ bot: ad || null, botAd: ad ? botAd(ad) : null });
  const dokunulmaz = (ad) => !!(ad && ((ov.botlar || {})[ad] || {}).dokunulmaz);
  const ISLE = {
    surec: (d) => {
      if (/denetleyicisiz başlatıldı/.test(d.ayrinti || '')) ekle('denetleyicisiz', { ne: d.ayrinti });
      if (!sorunlu(d)) return;
      if (/üst üste açılıp hemen kapandı/.test(d.ayrinti)) ekle('cokme-dongusu', { ne: d.ayrinti });
      else if (/beklenmedik biçimde açıldı/.test(d.ayrinti)) ekle('acilis-sayaci', { ne: d.ayrinti, kalkis: sonrakiTr(simdi, 0, 0) });
      else ekle('taninmayan', { ne: d.ayrinti, deg: { ad: d.ad }, ham: d.ayrinti });
    },
    donma: (d) => botBasina(d, (ad, x) => {
      if (/döngü 30 dk'da/.test(x.ayrinti)) { if (!kapsandi(ad, 'engel')) ekle(dokunulmaz(ad) ? 'bot-tekrar-haber' : 'bot-dongu-coktu', { ...B(ad), ne: x.ayrinti, neyiSaydi: { baslik: 'Son hata', satirlar: [kirp(x.ayrinti, 240)] } }); }
      else ekle('bot-donma-takildi', { ...B(ad), ne: x.ayrinti });
    }),
    bellek: (d) => sorunlu(d) && ekle('bellek', { ne: d.ayrinti }),
    disk: (d) => sorunlu(d) && ekle('disk', { ne: d.ayrinti, ciddiyet: d.durum === 'hata' ? 'mudahale' : 'dikkat', ciddiTon: /DİSK SAĞLIĞI/.test(d.ayrinti) ? 'tehlike' : undefined }),
    paket: (d) => sorunlu(d) && ekle('paket', { ne: d.ayrinti }),
    node: (d) => sorunlu(d) && ekle('node', { ne: d.ayrinti, ciddiyet: d.durum === 'hata' ? 'mudahale' : 'dikkat' }),
    saat: (d) => sorunlu(d) && ekle('saat', { ne: d.ayrinti }),
    sir: (d) => sorunlu(d) && ekle('sir-kilitli', { ne: d.ayrinti }),
    // C5: hesap başına kart (hesaplar satırı yoksa — eski sunucu — tek kart)
    yetki: (d) => {
      if (!sorunlu(d)) return;
      const tur = (x) => (x.cekme ? 'anahtar-cekme-izni' : x.ipYok ? 'anahtar-ip-yok' : x.saltOkumaDegil ? 'anahtar-salt-okuma-degil' : null);
      const hs = (Array.isArray(d.hesaplar) ? d.hesaplar : []).filter(sorunlu);
      const git = [EY.git('Ayarlar › Anahtarlar', '#/ayarlar/anahtarlar')];
      if (!hs.length) { ekle(/PARA ÇEKME/.test(d.ayrinti || '') ? 'anahtar-cekme-izni' : 'taninmayan', { ne: d.ayrinti, deg: { hesap: 'Bir borsa anahtarı', ad: d.ad }, eylemler: git }); return; }
      for (const x of hs) {
        const t = tur(x);
        if (!t) { ekle('taninmayan', { ne: `${x.ad}: ${x.ayrinti}`, deg: { ad: d.ad }, ham: x.ayrinti }); continue; }
        const demo = x.tur === 'demo';
        ekle(t, { ek: String(x.kimlik || x.ad).replace(/[^a-z0-9:-]/gi, '').slice(0, 60), ne: x.ayrinti, deg: { hesap: x.ad }, eylemler: git,
          ...(demo ? { ciddiyet: 'dikkat', ciddiTon: 'dikkat', ciddiNeden: 'Demo hesap — gerçek para yok; yine de alışkanlık olarak izni kapatın.' } : {}) });
      }
    },
    kilit: (d) => sorunlu(d) && ekle('kilit', { ne: d.ayrinti, kalkis: go.ozet.sonraki || null }),
    dosya: (d) => {
      if (!sorunlu(d)) return;
      const parcalar = String(d.ayrinti || '').split(' · ').filter(s => !/durum dosyası bozuk/.test(s) && !/^[^:]+: (okunuyor|durum dosyası)/.test(s));
      // 78.x: lib/database.js veriBozuk — mum veritabanı / kayıt dosyası ayrı kart (ayar kartının "ayarı yeniden girin" adımı onlara uymaz)
      const mum = parcalar.filter(s => /^mum veritabanı \(market\.db\)/.test(s));
      const kayit = parcalar.filter(s => /^kayıt dosyası /.test(s));
      const ayarKismi = parcalar.filter(s => !mum.includes(s) && !kayit.includes(s));
      if (mum.length) ekle('mum-db-bozuk', { ne: mum.join(' · ') });
      if (kayit.length) ekle('kayit-dosyasi-bozuk', { ne: kayit.join(' · '), ...(kayit.some(s => /KENARA ALINAMADI|okunamadı/.test(s)) ? { ciddiyet: 'mudahale' } : {}) });
      if (ayarKismi.length) ekle('dosya-bozuk', { ne: ayarKismi.join(' · '), ciddiyet: /OKUNAMADI|kilitli|eski sürümde/i.test(d.ayrinti) ? 'mudahale' : 'dikkat' });
    },
    yedek: (d) => sorunlu(d) && ekle('yedek', { ne: d.ayrinti }),
    uzak: (d) => sorunlu(d) && ekle('uzak-yedek', { ne: d.ayrinti }),
    kopya: (d) => sorunlu(d) && ekle('es-kopya', { ne: d.ayrinti }),
    geriDonus: (d) => sorunlu(d) && ekle('geri-donus', { ne: d.ayrinti }),
    guncel: (d) => {
      if (!sorunlu(d)) return;
      if (/imza doğrulaması kurulmamış/.test(d.ayrinti)) ekle('guncelleme-imza-yok', { ne: kirp(d.ayrinti, 200), eylemler: [EY.git('Kılavuz › Güncelleme', '#/kilavuz/kurulum')] });
      else if (!g.guncelleme) {   // güncelleme durumu ayrıca verilmediyse öz denetim satırından
        if (/yarıda/.test(d.ayrinti)) ekle('guncelleme-yarida', { ne: d.ayrinti });
        else if (/geri alındı/.test(d.ayrinti)) ekle('guncelleme-geri-alindi', { ne: d.ayrinti });
        else if (/imza doğrulamasından geçmedi/.test(d.ayrinti)) ekle('guncelleme-imzasiz', { ne: d.ayrinti });
        else ekle('taninmayan', { ne: d.ayrinti, deg: { ad: d.ad } });
      } else if (/yarıda/.test(d.ayrinti) && !(g.guncelleme.islem && g.guncelleme.islem.yarida)) ekle('guncelleme-yarida', { ne: d.ayrinti });
    },
    wyb: (d) => sorunlu(d) && ekle('wyb', { ne: d.ayrinti }),
    uyku: (d) => sorunlu(d) && ekle('uyku', { ne: d.ayrinti }),
    baglanti: (d) => botBasina(d, (ad, x) => {
      if (ad && (kapsandi(ad, 'baglanti') || kapsandi(ad, 'engel'))) return;
      if (/borsaya bağlı değil/.test(x.ayrinti)) ekle('bot-bagli-degil', { ...B(ad), ne: x.ayrinti });
      else if (/\[GERI_CEKILME\]/.test(x.ayrinti)) ekle('yurutucu-geri-cekilme', { ...B(ad), ne: x.ayrinti });
      else if (/\[BELIRSIZ\]/.test(x.ayrinti)) ekle('yurutucu-belirsiz', { ...B(ad), ne: x.ayrinti });
      else ekle('yurutucu-elle', { ...B(ad), ne: x.ayrinti });
    }),
    fiyat: (d) => {
      if (!sorunlu(d)) return;
      if (d.durum === 'hata') { if (!botlar.some(b => b.guvenliKip && gkTuru(b.guvenliKip) === 'gk-fiyat')) ekle('fiyat-sapmasi', { ne: d.ayrinti }); }
      else ekle('fiyat-okunamiyor', { ne: d.ayrinti });
    },
    // 74.3 D4: veri kalitesi — güvenli kipteyse bot kartı (gk-veri) anlatır; değilse bulgu kartı (izlemede karar engellenmez)
    veri: (d) => botBasina(d, (ad, x) => {
      if (ad && (kapsandi(ad, 'gk') || kapsandi(ad, 'engel'))) return;
      const agir = x.durum === 'hata';
      ekle('veri-kalitesi', { ...B(ad), ne: x.ayrinti, ciddiyet: agir ? 'dikkat' : 'gecici', ciddiTon: agir ? 'dikkat' : undefined,
        gecerMetin: agir ? 'Belki — veri bir sonraki günlük çalışmada temiz çıkarsa kart kaybolur; üst üste geliyorsa geçmez.' : undefined,
        neyiSaydi: { baslik: 'Son günlük çalışmanın bulgusu', satirlar: [kirp(x.ayrinti, 300)] }, eylemler: [EY.git('Sağlık › Veri kalitesi', '#/saglik'), ...(ad ? [botSayfasi(ad)] : [])] });
    }),
    bakim: (d) => {
      if (!sorunlu(d)) return;
      if (/yaklaşan bakım/.test(d.ayrinti)) ekle('bakim-yaklasan', { ne: d.ayrinti });
      else if (!botlar.some(b => b.guvenliKip && gkTuru(b.guvenliKip) === 'gk-bakim')) ekle('bakim-suruyor', { ne: d.ayrinti, kalkis: ov.bakimAktif && Number.isFinite(ov.bakimAktif.bit) ? ov.bakimAktif.bit + 15 * DK : null });
    },
    delist: (d) => botBasina(d, (ad, x) => ekle('bot-delist', { ...B(ad), ne: x.ayrinti })),
    kayitci: (d) => sorunlu(d) && ekle('kayitci', { ne: d.ayrinti }),
    internet: (d) => sorunlu(d) && ekle('internet', { ne: d.ayrinti }),
    mutabakat: (d) => botBasina(d, (ad, x) => {
      if (ad && kapsandi(ad, 'engel')) return;
      const tur = engelTuru(x.ayrinti) || 'bot-kol-uyusmazlik';
      const o = { ...B(ad), ne: x.ayrinti, eylemler: ad ? [...EY.mutabakatlar(ad), botSayfasi(ad)] : [] };
      if (tur === 'bot-coklu-varlik') {   // 73.8 (Y-43)
        const alt = cokluAltTur(x.ayrinti), at = alt && KATALOG['bot-coklu-varlik'].altTurler[alt];
        if (at) { o.adimlar = at.adimlar; o.neyiSaydi = { baslik: `Alt tür: ${at.ad}`, satirlar: [kirp(x.ayrinti, 300)] }; }
        if (alt === 'yabanci-bakiye' && ad) o.eylemler.unshift(EY.arac('yatirma-kabul', ad, 'Yatırmayı kabul et…'));
      }
      ekle(tur, o);
    }),
    stop: (d) => botBasina(d, (ad, x) => {
      if (/felaket stopu tetiklendi/.test(x.ayrinti)) { if (!(ad && kapsandi(ad, 'gk'))) ekle('gk-stop-vurus', { ...B(ad), ne: `${x.ayrinti}${dokunulmaz(ad) ? ' (demo kabul: yalnız haber, güvenli kip konmadı)' : ''}`, kalkis: ad && Number.isFinite(((ov.botlar || {})[ad] || {}).stopSonVurus) ? ov.botlar[ad].stopSonVurus + GUN : null }); }
      else if (x.durum === 'hata') { if (!(ad && kapsandi(ad, 'engel'))) ekle('bot-stop-kurulamadi', { ...B(ad), ne: x.ayrinti, neyiSaydi: { baslik: 'Son stop denetimi', satirlar: [kirp(x.ayrinti, 240)] } }); }
      else ekle('bot-stop-uyari', { ...B(ad), ne: x.ayrinti });
    }),
    marj: (d) => botBasina(d, (ad, x) => ekle('bot-marj', { ...B(ad), ne: x.ayrinti, ciddiyet: x.durum === 'hata' ? 'mudahale' : 'dikkat', deg: { seviye: x.durum === 'hata' ? 'ALARM' : 'uyarısı' }, eylemler: ad ? [EY.git('Hesap görünümü', `#/botlar/${ad}/hesap`), EY.acil(ad)] : [] })),
    zorla: (d) => botBasina(d, (ad, x) => ekle('bot-zorla', { ...B(ad), ne: x.ayrinti, eylemler: ad ? [botSayfasi(ad, 'hesap'), EY.acil(ad)] : [] })),
    funding: (d) => botBasina(d, (ad, x) => ekle('bot-funding', { ...B(ad), ne: x.ayrinti })),
    sapma: (d) => botBasina(d, (ad, x) => { const iyi = /İYİ/.test(x.ayrinti); ekle('bot-cusum', { ...B(ad), ne: x.ayrinti, ciddiyet: iyi ? 'bilgi' : 'dikkat', deg: { yon: iyi ? 'İYİ (lehte)' : 'KÖTÜ' } }); }),
    maliyet: (d) => botBasina(d, (ad, x) => ekle('bot-maliyet', { ...B(ad), ne: x.ayrinti })),
    tekrar: (d) => botBasina(d, (ad, x) => {
      if (ad && (kapsandi(ad, 'engel') || kapsandi(ad, 'gk'))) return;
      if (/güvenli kipte:/.test(x.ayrinti)) return;   // bot kartı güvenli kipi anlatıyor
      const v = ad ? ((ov.botlar || {})[ad] || {}) : {};
      if (/reddetti/.test(x.ayrinti)) ekle(dokunulmaz(ad) ? 'bot-tekrar-haber' : 'bot-emir-reddi', { ...B(ad), ne: x.ayrinti, neyiSaydi: { baslik: 'Sayılan ret satırları', satirlar: retSatirlari(v.emirRetler || [], simdi) } });
      else ekle(dokunulmaz(ad) ? 'bot-tekrar-haber' : 'gk-tekrar', { ...B(ad), ne: x.ayrinti, neyiSaydi: { baslik: 'Tekrarlayan satır', satirlar: [kirp(x.ayrinti, 240)] } });
    }),
    kacan: (d) => botBasina(d, (ad, x) => {
      if (/ENGELLİ|güvenli kipte/.test(x.ayrinti) || (ad && (kapsandi(ad, 'engel') || kapsandi(ad, 'gk')))) return;
      ekle('bot-kacan', { ...B(ad), ne: x.ayrinti });
    }),
    telegram: (d) => {
      if (!sorunlu(d)) return;
      const a = String(d.ayrinti || '');
      if (/\b409\b/.test(a)) ekle('telegram-409', { ne: a });
      else if (/\b401\b/.test(a)) ekle('telegram-401', { ne: a });
      else if (/gönderim başarısız/.test(a)) ekle('telegram-gonderim', { ne: a });
      else if (/bekliyor/.test(a)) ekle('telegram-kuyruk', { ne: a });
      else ekle('telegram-bagli-degil', { ne: a });
    },
    sinyal: (d) => {
      if (!sorunlu(d)) return;
      if (/adres yok — sunucu kapanırsa/.test(d.ayrinti)) ekle('sinyal-yok', { ne: d.ayrinti, eylemler: [EY.git('Ayarlar › Bildirimler', '#/ayarlar/bildirimler', false)] });
      else ekle('sinyal-ping', { ne: d.ayrinti });
    },
  };
  for (const d of denetimler) {
    const f = ISLE[d.kimlik];
    if (f) { try { f(d); } catch (e) { ekle('taninmayan', { ne: `${d.ad}: ${d.ayrinti} (sınıflandırılamadı: ${e.message})`, deg: { ad: d.ad } }); } }
    else if (sorunlu(d)) ekle('taninmayan', { ne: `${d.ad}: ${d.ayrinti}`, deg: { ad: d.ad }, ham: d.ayrinti });
  }

  // ── 3. Güncelleme ──
  const gu = g.guncelleme;
  if (gu && !gu.gelistirme) {
    const neden = String(gu.neden || '');
    if (gu.islem && gu.islem.yarida && !l.some(x => x.tur === 'guncelleme-yarida')) ekle('guncelleme-yarida', { ne: 'Güncelleyici süreç işlemi bitirmeden kapandı.' });
    if (gu.durum === 'onay') ekle('guncelleme-onay', { ne: `${gu.hedefSurum || 'Yeni sürüm'} kurulmayı bekliyor${gu.kuruFark && gu.kuruFark.hedef === gu.hedef ? ' — kuru deneme bugünkü kararda FARK buldu (Ayarlar › Güncelleme)' : ''}.`, deg: { surum: gu.hedefSurum || 'yeni sürüm' } });
    else if (gu.durum === 'elle') ekle(/İMZASIZ|imza doğrulamasından geçmedi/i.test(neden) || gu.imza === 'gecersiz' ? 'guncelleme-imzasiz' : /2 kez|iki kez|geri alındı/.test(neden) ? 'guncelleme-geri-alindi' : 'guncelleme-elle', { ne: kirp(neden || 'Ayarlar › Güncelleme\'de neden yazıyor.', 300) });
    else if (gu.durum === 'geri-alindi') ekle(/eski sürüm de açılmadı|KAPALI/i.test(`${neden} ${gu.geriDonus || ''}`) ? 'guncelleme-kapali' : 'guncelleme-geri-alindi', { ne: kirp(`${gu.hedefSurum || 'Yeni sürüm'}: ${neden}`, 300) });
    else if (gu.durum === 'yeniden-baslat') ekle(/KAPALI/.test(neden) ? 'guncelleme-kapali' : 'guncelleme-yeniden-baslat', { ne: kirp(neden, 300) });
    else if (gu.durum === 'ag-hatasi' && (gu.agHatasi || 0) >= 1) ekle('guncelleme-github', { ne: `${gu.agHatasi}. denemede de GitHub'a ulaşılamadı. ${kirp(neden, 160)}`, kalkis: sonrakiTr(simdi, 12, 0), ciddiyet: (gu.agHatasi || 0) >= 3 ? 'dikkat' : 'gecici' });
  }

  // ── 4. Veri, ileri test, PIN, taşıma, donma, günlük, saat dilimi ──
  const ve = g.veri;
  if (ve) {
    if (ve.binanceBekleme && Date.parse(ve.binanceBekleme.bitis) > simdi) ekle('veri-bekleme', { ne: `Binance ${ve.binanceBekleme.kod || ''} dedi${ve.binanceBekleme.neden ? ` (${kirp(ve.binanceBekleme.neden, 120)})` : ''}.`, kalkis: Date.parse(ve.binanceBekleme.bitis) });
    const hatali = (ve.kaynaklar || []).filter(s => s.durum === 'hata');
    if (hatali.length) ekle('veri-hata', { ne: hatali.slice(0, 4).map(s => `${s.kisaAd || s.ad}: ${kirp(s.hata, 90)}`).join(' · ') + (hatali.length > 4 ? ` · +${hatali.length - 4}` : ''), ciddiyet: hatali.some(s => s.sonBasari && simdi - Date.parse(s.sonBasari) > 3 * GUN) ? 'dikkat' : 'gecici' });
    if (ve.kismiEvren) ekle('veri-kismi', { ne: ve.kismiEvren.metin, kalkis: Date.parse(ve.kismiEvren.tamamlanir) });
  }
  const pb = g.piyasaBaglami;
  if (pb && pb.calisiyor && (pb.sorunlu || []).length) ekle('piyasa-bayat', { ne: pb.sorunlu.slice(0, 4).map(s => `${s.kisaAd}: ${s.saat} saattir alınamıyor (${kirp(s.hata, 90)})`).join(' · ') });
  // 74.1 Yapay zekâ notları (lib/yapayZeka durum())
  const yz = g.yapayZeka;
  if (yz && !yz.arastirma) {
    if (yz.durum === 'anahtar-bekliyor') ekle('yz-anahtar', { ne: 'Ayarlar › Anahtarlar\'da "Gemini API anahtarı" boş — Yapay zekâ notları çalışmıyor.' });
    else if (yz.durum === 'anahtar-hatasi') ekle('yz-calismadi', { ne: `Gemini anahtarı reddedildi: ${kirp((yz.anahtarHatasi && yz.anahtarHatasi.hata) || yz.hata || '', 200)}`, ciddiyet: 'dikkat' });
    else if (yz.durum === 'kota') ekle('yz-calismadi', { ne: 'Gemini ücretsiz günlük kotası doldu — kalan konular yarın okunur.', kalkis: Number.isFinite(yz.sonraki) ? yz.sonraki : null });
    else if (yz.durum === 'hata') ekle('yz-calismadi', { ne: kirp(yz.hata || 'okuma yarıda kaldı', 240) });
    if (yz.sonCalisma && yz.sonCalisma.kanarya === false && Number.isFinite(yz.sonCalisma.bit) && simdi - yz.sonCalisma.bit < GUN) ekle('yz-kanarya', { ne: `${yz.sonCalisma.gun}: model sayfaya gömülü talimata uydu — o günün notları işaretlendi.` });
  }
  const ii = g.ileri;
  if (ii && ii.sonHata && !ii.calisiyor) ekle('ileri-izleyici', { ne: kirp(ii.sonHata, 240), kalkis: Number.isFinite(ii.sonDeneme) ? ii.sonDeneme + 15 * DK : null });
  const pin = g.acilPin;
  if (pin && g.rol !== 'arastirma') {
    if (pin.kilitli) ekle('acil-pin-kilitli', { ne: 'Telefondan acil durdurma şu an kilitli.', kalkis: pin.kilitBitis ? Date.parse(pin.kilitBitis) : null });
    else if (!pin.tanimli) ekle('acil-pin-yok', { ne: 'data\\acil-pin.json yok.' });
  }
  if (g.tasimaBekliyor) ekle('tasima-mutabakat', { ne: 'Taşıma dosyası içe aktarıldı; botlar mutabakat bekliyor.', eylemler: [EY.git('Botlar', '#/botlar')] });
  if (g.donma && Number.isFinite(g.donma.zaman) && simdi - g.donma.zaman < GUN) ekle('donma-oldu', { ne: `${trSaat(g.donma.zaman, simdi)}: ${kirp(g.donma.neden || 'süreç dondu', 200)}`, kalkis: g.donma.zaman + GUN });
  const ozKirmizi = l.some(x => x.ciddiyet === 'mudahale');
  if (g.gunluk && g.gunluk.hata > 0 && !ozKirmizi) ekle('gunluk-hata', { ne: `Son 24 saatte ${g.gunluk.hata} hata satırı${g.gunluk.sonHata ? ` · son: ${kirp(g.gunluk.sonHata, 140)}` : ''}.` });
  if (g.saatDilimi && g.rol !== 'arastirma' && !/^(Europe\/Istanbul|Asia\/Istanbul|Turkey|Etc\/GMT-3)$/.test(g.saatDilimi)) ekle('saat-dilimi', { ne: `Saat dilimi: ${g.saatDilimi}` });
  devralmaKartlari(g.devralma, g.rol, ekle, simdi);

  // ── 5. Araştırma kopyası: sunucu bağlantısı ve kuyruk (YEREL) ──
  const ye = g.yerel;
  if (ye) {
    const eb = ye.evBaglanti;
    if (eb && eb.etkin) {
      if (eb.sorun) ekle('sunucu-ayar-bozuk', { ne: eb.sorun === 'eski-sifreli' ? 'ev-baglanti.json eski şifreli (69.x).' : 'ev-baglanti.json geçersiz.', kaynak: 'yerel' });
      else if (eb.kurulu && eb.sonHata && (!eb.sonBasari || eb.sonHataZaman > eb.sonBasari)) {
        ekle(/reddetti \((401|403)\)/.test(eb.sonHata) ? 'sunucu-jeton' : 'sunucu-ulasilamiyor', { ne: `${kirp(eb.sonHata, 240)}${eb.sonBasari ? ` · son başarılı okuma ${trSaat(eb.sonBasari, simdi)}` : ''}`, kaynak: 'yerel' });
      }
    }
    const kq = ye.evKuyruk;
    if (kq && (kq.bekleyen || 0) > 0) ekle('ev-kuyruk', { ne: `${kq.bekleyen} yazma sunucuya gönderilmeyi bekliyor${kq.sonHata ? ` (son deneme: ${kirp(kq.sonHata, 120)})` : ''}.`, kaynak: 'yerel', ciddiyet: /reddetti \(40[13]\)/.test(kq.sonHata || '') ? 'dikkat' : 'gecici' });
    if (ye.sunucuEski) ekle('sunucu-eski', { ne: ye.sunucuEski, kaynak: 'yerel' });
  }

  // Sırala: ciddiyet, sonra bot, sonra başlık. Aynı kimlik iki kez çıkmasın.
  const gorulen = new Set();
  const sorunlar = l.filter(k => { if (gorulen.has(k.kimlik)) return false; gorulen.add(k.kimlik); return true; })
    .sort((a, b) => CIDDIYET_SIRA[a.ciddiyet] - CIDDIYET_SIRA[b.ciddiyet] || String(a.botAd || '').localeCompare(String(b.botAd || ''), 'tr') || a.baslik.localeCompare(b.baslik, 'tr'));
  return { sorunlar, sayac: sayac(sorunlar), sonDenetim: (go && go.ozet && go.ozet.sonYoklama) || null, calisiyor: !!oz.calisiyor };
}

/** Saf: kart listesi → { mudahale, dikkat, gecici, bilgi, toplam }. */
function sayac(l) {
  const s = { mudahale: 0, dikkat: 0, gecici: 0, bilgi: 0, toplam: 0 };
  for (const k of l || []) { if (s[k.ciddiyet] != null) s[k.ciddiyet]++; s.toplam++; }
  return s;
}

// ── SIR TARAMASI ───────────────────────────────────────────────────────────────
/**
 * Saf: metinden sırları siler. `bilinenler`: sunucunun gerçek sır değerleri (anahtar, jeton, chat id, sağlık adresleri, ntfy konusu,
 * panel jetonu) — en kısa 6 karakterlikler de birebir silinir. Desenler: Telegram jetonu, ping / heartbeat adresleri, ntfy adresi,
 * e-posta, chat_id=…, 32+ karakterlik anahtar/uuid benzeri, sorgu dizgisindeki imza.
 */
function sirTemizle(metin, bilinenler = []) {
  let s = String(metin == null ? '' : metin);
  const bl = [...new Set((bilinenler || []).map(x => String(x || '').trim()).filter(x => x.length >= 6))].sort((a, b) => b.length - a.length);
  for (const b of bl) s = s.split(b).join('[gizli]');
  return s
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[jeton]')
    .replace(/https?:\/\/(?:hc-ping\.com|[^\s/]*healthchecks[^\s/]*|uptime\.betterstack\.com|[^\s/]*betteruptime[^\s/]*)\/[^\s"')]+/gi, '[sağlık adresi]')
    .replace(/https?:\/\/ntfy\.sh\/[^\s"')]+/gi, 'ntfy.sh/[konu]')
    .replace(/(https?:\/\/[^\s?#"']+)\?[^\s"'#]*/gi, '$1?[…]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-posta]')
    .replace(/(chat[_ ]?id["'\s:=]+)-?\d{5,}/gi, '$1[gizli]')
    .replace(/((?:api[_-]?key|apiSecret|secret|botToken|token|jeton|parola|password|signature)["']?\s*[:=]\s*["']?)[^\s"',}]{6,}/gi, '$1[gizli]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[gizli]');
}
/** Saf: metin bilinen sırlardan birini ya da sır desenini hâlâ içeriyor mu (öz test ve paket son denetimi). */
function sizmaVarMi(metin, bilinenler = []) {
  const s = String(metin || '');
  for (const b of bilinenler || []) { const t = String(b || '').trim(); if (t.length >= 6 && s.includes(t)) return true; }
  return /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(s) || /hc-ping\.com\/[0-9a-f-]{8,}/i.test(s) || /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s) || /\b[A-Za-z0-9_-]{32,}\b/.test(s);
}

// ── METİN ÇIKTILARI ────────────────────────────────────────────────────────────
const CIDDIYET_ETIKET = { mudahale: 'MÜDAHALE', dikkat: 'DİKKAT', gecici: 'GEÇECEK', bilgi: 'BİLGİ' };
/** Saf: kart → düz metin (teşhis paketi, panoya kopya). */
function kartMetni(k) {
  const l = [`[${CIDDIYET_ETIKET[k.ciddiyet] || k.ciddiyet}] ${k.baslik}${k.kaynak === 'yerel' ? ' (bu bilgisayar)' : ''}  · tür ${k.tur}${k.envanter && k.envanter.length ? ` · ${k.envanter.join(', ')}` : ''}`];
  if (k.ne) l.push(`  Ne oldu: ${k.ne}`);
  l.push(`  Ciddi mi: ${k.ciddi.tonAd} — ${k.ciddi.neden}`);
  l.push(`  Kendiliğinden geçer mi: ${k.gecer.metin}${k.gecer.kalkisMetin ? ` · ${k.gecer.kalkisMetin}` : ''}`);
  k.adimlar.forEach((a, i) => l.push(`  ${i + 1}) ${a}`));
  if (k.dokunma) l.push(`  Dokunmayın: ${k.dokunma}`);
  if (k.neyiSaydi) {
    l.push(`  Neyi saydı — ${k.neyiSaydi.baslik}:`);
    for (const s of k.neyiSaydi.satirlar || []) l.push(`    ${s}`);
    if (k.neyiSaydi.tablo) { l.push(`    ${k.neyiSaydi.tablo.basliklar.join(' | ')}`); for (const r of k.neyiSaydi.tablo.satirlar) l.push(`    ${r.join(' | ')}`); }
  }
  if (k.ham && !String(k.ne || '').includes(k.ham.slice(0, 60))) l.push(`  Ham: ${k.ham}`);
  return l.join('\n');
}

const PAKET_SINIRI = 12000;
/**
 * Saf: "Sohbete gönder" teşhis paketi (düz metin, sır temizlenmiş, ≤ 12 000 karakter).
 * @param p { simdi, surum, commit, ayarIzi, rol, makine, sorunlar: [kart], yerel: [kart], oz: { ozet }, sonRapor: { dosya, bot, kaynak, zaman, metin, denetimler },
 *            botlar: [satır metni], sayaclar: [satır], gunluk: [{ t, s, b, m }], one: kart kimliği (önce yazılır) } · bilinenler: sır değerleri
 */
function teshisMetni(p = {}, bilinenler = []) {
  const simdi = Number.isFinite(p.simdi) ? p.simdi : Date.now();
  const kartlar = [...(p.sorunlar || []), ...(p.yerel || [])];
  if (p.one) kartlar.sort((a, b) => (a.kimlik === p.one ? -1 : b.kimlik === p.one ? 1 : 0));
  const s = sayac(kartlar);
  const ust = [
    `PUSULA TEŞHİS PAKETİ — ${trSaat(simdi, simdi + 2 * GUN)} TR (sır içermez: anahtar, jeton, chat id, sağlık adresi, e-posta silinir)`,
    `Sürüm ${p.surum || '?'}${p.commit ? ` (commit ${String(p.commit).slice(0, 7)})` : ''}${p.ayarIzi ? ` · ayar izi ${p.ayarIzi}` : ''} · makine: ${p.rol === 'arastirma' ? 'araştırma kopyası (geliştirme bilgisayarı)' : 'sunucu'}${p.makine ? ` · ${p.makine}` : ''}`,
    p.oz && p.oz.ozet ? `Öz denetim: ${p.oz.ozet.toplam} denetim · ${p.oz.ozet.tamam} tamam · ${p.oz.ozet.uyari} uyarı · ${p.oz.ozet.hata} hata · son yoklama ${p.oz.ozet.sonYoklama ? trSaat(p.oz.ozet.sonYoklama, simdi) : 'yok'}` : 'Öz denetim: bu makinede çalışmıyor',
    '',
    `ETKİN SORUNLAR (${s.toplam}: ${s.mudahale} müdahale · ${s.dikkat} dikkat · ${s.gecici} geçecek · ${s.bilgi} bilgi)`,
  ];
  const govde = kartlar.length ? kartlar.map(kartMetni) : ['Yok — her şey yolunda.'];
  const r = p.sonRapor;
  const rapor = r ? ['', `SON OLAY RAPORU: ${r.dosya}${r.bot ? ` · bot ${r.bot}` : ''}${r.kaynak ? ` · ${r.kaynak}` : ''}${r.zaman ? ` · ${trSaat(r.zaman, simdi)}` : ''}`, ...(r.metin ? [`  ${kirp(r.metin, 300)}`] : []), ...((r.denetimler || []).slice(0, 8).map(d => `  ${d.ad}: ${d.durum} — ${kirp(d.ayrinti, 140)}`))] : ['', 'SON OLAY RAPORU: yok'];
  const bot = ['', 'BOTLAR', ...((p.botlar || []).length ? p.botlar.map(x => `  ${x}`) : ['  (bilgi yok)'])];
  const say = ['', 'SAYAÇLAR', ...((p.sayaclar || []).length ? p.sayaclar.map(x => `  ${x}`) : ['  —'])];
  const gl = (p.gunluk || []);
  const gun = ['', `SON 30 DK UYARI / HATA SATIRLARI (${gl.length})`, ...(gl.length ? gl.map(x => `  ${String(x.t || '').slice(11, 19)} ${x.s === 'hata' ? 'ERROR' : x.s === 'uyari' ? 'WARN ' : String(x.s || '').toUpperCase()} ${x.b ? `[${x.b}] ` : ''}${kirp(x.m, 260)}`) : ['  yok'])];
  const son = ['', 'Bu paketi geliştirme sohbetine yapıştırın. Olay raporu dosyası (Sağlık › Olay raporları) gerekiyorsa ayrıca eklenir.'];
  // Uzunluk sınırı: önce günlük satırları kısalır, sonra kart ayrıntısı.
  let parcalar = [...ust, ...govde, ...rapor, ...bot, ...say, ...gun, ...son];
  let metin = sirTemizle(parcalar.join('\n'), bilinenler);
  let n = gl.length;
  while (metin.length > PAKET_SINIRI && n > 0) {
    n = Math.max(0, n - 10);
    parcalar = [...ust, ...govde, ...rapor, ...bot, ...say, '', `SON 30 DK UYARI / HATA SATIRLARI (${gl.length}, son ${n} gösteriliyor)`, ...gl.slice(-n).map(x => `  ${String(x.t || '').slice(11, 19)} ${x.s === 'hata' ? 'ERROR' : 'WARN '} ${x.b ? `[${x.b}] ` : ''}${kirp(x.m, 200)}`), ...son];
    metin = sirTemizle(parcalar.join('\n'), bilinenler);
  }
  if (metin.length > PAKET_SINIRI) metin = metin.slice(0, PAKET_SINIRI - 60) + '\n… (paket uzunluk sınırında kesildi)';
  return metin;
}

/** Saf: Telegram /teshis cevabı (düz metin; her sorun için ilk 2 kısa adım). */
function telegramTeshis(sonuc = {}, { panelAdresi = null, simdi = Date.now(), bilinenler = [] } = {}) {
  const l = (sonuc.sorunlar || []).filter(k => k.ciddiyet !== 'bilgi');
  const bilgi = (sonuc.sorunlar || []).length - l.length;
  const bag = panelAdresi ? `Sorunlar: ${String(panelAdresi).replace(/\/+$/, '')}/#/sorunlar` : 'Panel › Sorunlar';
  const ust = `TEŞHİS — ${trSaat(simdi, simdi + 2 * GUN)} TR${sonuc.sonDenetim ? ` · son denetim ${sureMetni(simdi - sonuc.sonDenetim)} önce` : ''}`;
  if (!l.length) return sirTemizle(`${ust}\n\nHer şey yolunda — müdahale ya da dikkat gerektiren sorun yok${bilgi ? ` (${bilgi} bilgi notu panelde)` : ''}.\n${bag}`, bilinenler);
  const s = sayac(l);
  const satirlar = [ust, '', `${l.length} etkin sorun: ${s.mudahale} müdahale · ${s.dikkat} dikkat · ${s.gecici} kendiliğinden geçecek`, ''];
  for (const k of l.slice(0, 12)) {
    satirlar.push(`• [${CIDDIYET_ETIKET[k.ciddiyet]}] ${k.baslik}`);
    if (k.gecer.kalkisMetin) satirlar.push(`  Geçer: ${k.gecer.kalkisMetin}`);
    k.kisa.slice(0, 2).forEach((a, i) => satirlar.push(`  ${i + 1}) ${a}`));
  }
  if (l.length > 12) satirlar.push(`… +${l.length - 12} sorun daha (panelde)`);
  satirlar.push('', bag);
  return sirTemizle(satirlar.join('\n'), bilinenler);
}

/**
 * Saf: Telegram alarm / uyarı mesajı (düz metin: başlık + gövde) → ilgili katalog türünün 2–3 kısa adımı.
 * @returns { tur, kisa: [..], kilavuz } | null
 */
function telegramEslestir(duzMetin) {
  const s = String(duzMetin || '');
  if (!s.trim()) return null;
  for (const id of TELEGRAM_SIRA) {
    const k = KATALOG[id];
    if (k && k.telegram && k.telegram.test(s)) return { tur: id, kisa: k.kisa.slice(0, 3), kilavuz: KLV(k.kilavuz) };
  }
  return null;
}
/** Saf: "Ne yapmalı" satırı (Telegram HTML'ine girer → & < > kaçırılır). */
function neYapmaliSatiri(adimlar, panelAdresi) {
  const kac = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const a = (adimlar || []).filter(Boolean).slice(0, 3);
  const bag = panelAdresi ? `Sorunlar: ${kac(String(panelAdresi).replace(/\/+$/, ''))}/#/sorunlar` : 'Panel › Sorunlar';
  return `${a.length > 1 ? a.map((x, i) => `${i + 1}) ${kac(x)}`).join(' ') : a.length ? kac(a[0]) : ''}${a.length ? ' · ' : ''}${bag}`;
}

// ── ÖRNEK (kılavuz görüntüsü — gerçek veri değil) ───────────────────────────────
/** Saf: kılavuz ekran görüntüsü için ÖRNEK girdi (taslaktaki üç kart + bir bilgi). Gerçek veri DEĞİL. */
function ornekGirdi(simdi = Date.now()) {
  const g = simdi - 2 * DK;
  return {
    simdi, rol: 'sunucu',
    oz: { calisiyor: true, goruntu: { ozet: { toplam: 33, tamam: 31, uyari: 1, hata: 1, sonYoklama: g, sonraki: g + 5 * DK }, denetimler: [
      { kimlik: 'guncel', ad: 'Son güncelleme', durum: 'tamam', ayrinti: 'onay · çalışan sürüm 73.6' },
    ], botlar: [] },
    veri: { botlar: { denge: { tk: { kaynak: 'emirRet', zaman: simdi - 40 * DK, satirlar: [
      { zaman: simdi - 41 * DK, kod: '-2019', sinif: 'dikkat', metin: 'borsa: Emir ag-örnek-1 reddedildi: {"code":-2019,"msg":"Margin is insufficient."}' },
      { zaman: simdi - 40.5 * DK, kod: '-2019', sinif: 'dikkat', metin: 'borsa: Emir ag-örnek-2 reddedildi: {"code":-2019,"msg":"Margin is insufficient."}' },
      { zaman: simdi - 40 * DK, kod: '-2019', sinif: 'dikkat', metin: 'borsa: Emir ag-örnek-3 reddedildi: {"code":-2019,"msg":"Margin is insufficient."}' }] } } },
      bakimAktif: { bas: simdi - 20 * DK, bit: simdi + 25 * DK, baslik: 'Binance Futures planlı sistem bakımı (örnek)' }, ayar: { bakimSonraMs: 15 * DK } } },
    botlar: [
      { ad: 'denge', adGorunen: 'Tao', mod: 'demo', calisiyor: true, bindirmeEngel: "öz denetim: borsa emirleri 30 dk'da 3 kez reddetti (kod -2019 — Hesapta yeni pozisyon için teminat kalmadı) — Botlar › Hesap görünümünde teminat oranına bakın", yurutucu: { durum: 'AKTIF' } },
      { ad: 'hucum', adGorunen: 'Kairos', mod: 'demo', calisiyor: true, guvenliKip: { kaynak: 'oz:bakim', metin: 'Binance bakımı: Binance Futures planlı sistem bakımı (örnek)', zaman: simdi - 20 * DK }, yurutucu: { durum: 'AKTIF' } },
    ],
    guncelleme: { durum: 'onay', hedefSurum: '73.8', hedef: 'ornek' },
    acilPin: { tanimli: true, kilitli: false }, saatDilimi: 'Europe/Istanbul',
    veri: { kaynaklar: [], kismiEvren: { metin: "tam coin evreni 30 Eylül'e kadar; aylık arşiv 2 Kasım 09:00'da gelir (örnek)", tamamlanir: new Date(simdi + 8 * GUN).toISOString() } },
  };
}

module.exports = {
  KATALOG, CIDDIYETLER, CIDDIYET_AD, TELEGRAM_SIRA, KOD_HATASI_RE,
  uret, kart, sayac, devralmaKartlari, engelTuru, gkTuru, cokluAltTur, uyusmazlikTablosu, retSatirlari,
  sirTemizle, sizmaVarMi, kartMetni, teshisMetni, telegramTeshis, telegramEslestir, neYapmaliSatiri,
  trSaat, kalkisMetni, sureMetni, sonrakiTr, ornekGirdi, PAKET_SINIRI, EY,
};
