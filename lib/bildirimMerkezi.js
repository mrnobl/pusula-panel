/**
 * BİLDİRİM MERKEZİ — Telegram'a (ve ntfy'a) giden her mesaj tek yerde (PLAN-PANEL-2 §0.3, kullanıcı kararı 2026-10-19; 73.5 D8)
 * ═══════════════════════════════════════════════════════════════════════════
 * Panelde iki gönderim yolu var: motorun `notify` katmanı (lib/telegram.js) ve portföy botlarının `Bildirici`'si
 * (lib/live/isletim.js). İkisi de sonunda `TelegramNotifier.sendMessageDetailed(metin)` kapısından geçer. Merkez o kapıya
 * bağlanır (`telegram.merkezBagla(m)`): bot koduna dokunmadan
 *   · her giden mesajı KATALOG'daki bir türe ayırır (`siniflandir` — simge + başlık kuralları, SAF; yeni üreticiler türü açıkça verir),
 *   · tür kapalıysa göndermez (çağırana "gönderildi sayılır" döner — giden kutusu boşuna yeniden denemesin),
 *   · 73.5: tür başına METİN ŞABLONU (boş = bugünkü metin aynen), KANAL (Telegram / ntfy / ikisi), SESSİZ SAAT davranışı,
 *   · her denemeyi kayda geçer (data/bildirim-gecmis.jsonl; son 1000 satır).
 * KRİTİK türler (acil · koruma · engel · güvenlik) kilitlidir: kapatılamaz, sessiz saati deler, kanalda Telegram hep vardır;
 * yalnız metinleri değişir (boş → varsayılan). Ayarlar data/bildirim-ayar.json (sır değil; 73.5 biçimi { surum: 2, turler, sessiz,
 * uretici } — eski düz { tur: bool } biçimi okunur ve ilk yazmada dönüştürülür). İlk açılışta eski config.json bayrakları
 * (notifyTrades/notifyErrors/notifyLifecycle) varsayılan olur.
 *
 * SESSİZ SAAT (kullanıcı kararı 2026-10-24, tasarım): genel pencere (İstanbul saati, ör. 23:00–08:00), varsayılan KAPALI.
 * Tür başına: "ozet" (bekletilir, pencere bitince TEK özet mesajı — sunucu dakikada bir `sessizBosalt`) · "dusur" (sessizce
 * düşer, kayıtta görünür) · "gonder" (sessiz saati yok sayar). Kritik türler her zaman "gonder".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');
const BM = require('./bildirimMetinleri');

const GENEL_DEGISKEN = [
  { ad: 'simge', aciklama: 'Baştaki simge (🚨 ⚠️ 📊 …)' },
  { ad: 'baslik', aciklama: 'Sade başlık (bot · ne oldu)' },
  { ad: 'govde', aciklama: 'Açıklama satırları' },
  { ad: 'ne_yapmali', aciklama: '"Ne yapmalı" önerisi (yoksa satır düşer)' },
  { ad: 'zaman', aciklama: 'Kısa saat (24 Eki 03:02)' },
  { ad: 'bot', aciklama: 'Bot adı (bot mesajı değilse boş)' },
  { ad: 'mesaj', aciklama: 'Bugünkü mesajın tamamı (varsayılan metin)' },
];

const P = (simge, baslik, govde, ne) => ({ simge, baslik, govde, ne: ne || '' });
/**
 * Katalog: sıra ekrandaki sıradır. `ornek`: önizleme mesajı (ham metin — bugünkü biçimden geçer) ya da `ornekParca` (yeni türler).
 * `degiskenler`: türe özel ek değişkenler. `uretici`: 73.5 yeni tür (yalnız sunucuda üretilir).
 */
const KATALOG = [
  { id: 'acil', grup: 'Kritik (kapatılamaz)', ad: 'Acil durum', aciklama: 'Acil durdurma, bot tamamen kapandı, borsa pozisyonu zorla kapattı, çalışmada hata, bot çalışmadı, çökme, kurulamayan güncelleme', onem: 'kritik', kilitli: true,
    ornek: '🚨 <b>Kairos (demo): ACİL DURDURMA</b>\n\nsebep: panelden elle\n2 emir iptal, 1 pozisyon kapatma emri\n\n<i>🧭 Pusula · x</i>' },
  { id: 'koruma', grup: 'Kritik (kapatılamaz)', ad: 'Koruma stopu', aciklama: 'Felaket stopu konamadı, borsada görünmüyor (kayboldu), güncellenemedi ya da çalıştı', onem: 'kritik', kilitli: true,
    ornek: '🚨 <b>Kairos (demo): felaket stopu kayboldu</b>\n\nBTCUSDT koruma stopu borsada bulunamadı.\n\n<i>🧭 Pusula · x</i>' },
  { id: 'engel', grup: 'Kritik (kapatılamaz)', ad: 'Bot ENGEL / güvenli kip / emir freni', aciklama: 'Bot yeni emir vermiyor: ENGEL (uygulama sapması, pozisyon uyuşmazlığı), emir freni, güvenli kip, yürütücü durdu, mutabakat uyuşmazlığı, hesap kesicisi', onem: 'kritik', kilitli: true,
    ornek: '🚨 <b>Tao (demo): ENGEL — uygulama sapması</b>\n\nSon 30 g sapma %5.4\nBot yeni emir vermiyor. İncele, sonra panelden "Engeli kaldır".\n\n<i>🧭 Pusula · x</i>' },
  { id: 'guvenlik', grup: 'Kritik (kapatılamaz)', ad: 'Güvenlik', aciklama: 'PIN kilidi (yanlış denemeler), canlı hesaba geçiş / canlı emir onayı, sunucunun dış IP adresi değişti, ayar dosyası bozuk açıldı, sunucudaki .git/config değişti', onem: 'kritik', kilitli: true,
    ornek: '🚨 <b>PIN kilitlendi (yanlış denemeler)</b>\n\nPIN: 5 yanlış deneme — 1 dakika kilitlendi.\n\n<i>🧭 Pusula · x</i>' },
  { id: 'islem', grup: 'Botlar', ad: 'İşlem yapıldı', aciklama: 'Bot bir coin aldığında ya da sattığında (günün işlemleri)', onem: 'bilgi',
    ornek: '💱 <b>Kairos (demo): işlemler 2026-10-24</b>\n\nBTCUSDT buy 0.012 @ 67250.5\n\n<i>🧭 Pusula · x</i>' },
  { id: 'ozet', grup: 'Botlar', ad: 'Günlük bot özeti', aciklama: 'Botun her günkü çalışmasından sonra: karar, hesap değeri, koruma stopu', onem: 'bilgi',
    ornek: '📊 <b>Kairos (demo): günlük özet 2026-10-24</b>\n\nKarar: BTC LONG AÇIK\nÖzsermaye 4999.29 USDT\n\n<i>🧭 Pusula · x</i>' },
  { id: 'yasam', grup: 'Botlar', ad: 'Başlatma / durdurma', aciklama: 'Sunucu ya da bot başladığında, bağlantı kurulduğunda, piyasa verisi geri geldiğinde', onem: 'bilgi',
    ornek: 'ℹ️ <b>Bot Sunucusu Başlatıldı</b>\n\nPusula çalışıyor.\n\n<i>🧭 Pusula · x</i>' },
  { id: 'hata', grup: 'Botlar', ad: 'Uyarı ve hata', aciklama: 'Borsaya ya da veriye ulaşılamadı, disk dolmak üzere gibi dikkat isteyen durumlar', onem: 'uyari',
    ornek: '⚠️ <b>Piyasa Verisi Alınamıyor</b>\n\nBinance yanıt vermiyor.\n\n<i>🧭 Pusula · x</i>' },
  { id: 'rapor', grup: 'Portföy ve raporlar', ad: 'Günlük / haftalık rapor', aciklama: 'Her sabah 09:00 günlük rapor özeti, pazartesi haftalık özet', onem: 'bilgi',
    ornek: '📋 <b>Günlük rapor 2026-10-24</b>\nKairos +%0,8 · Tao +%0,3' },
  { id: 'model', grup: 'Portföy ve raporlar', ad: 'Model uygulama günü', aciklama: 'Model portföylerin alım-satım listesi (kâğıt hesap) hazır olduğunda', onem: 'bilgi',
    ornek: 'ℹ️ <b>Lydia — 2026-10-24 alım-satım (kâğıt hesap)</b>\n\nASTOR al 25 adet\n\n<i>🧭 Pusula · x</i>' },
  { id: 'bilanco', grup: 'Portföy ve raporlar', ad: 'Bilanço özeti', aciklama: 'Günde en çok 2 özet (varsayılan 13:00 ve 20:30; bilanço yoksa mesaj yok): BIST 100 vekili + elinizdeki hisseler (Lydia, Portföyüm) — en dikkat çeken çeyrek net kâr değişimleri, elinizdekiler her zaman 📌 ile; yorum ve öneri yok', onem: 'bilgi', uretici: true,
    degiskenler: [{ ad: 'saat', aciklama: 'Özet saati (13:00)' }, { ad: 'sayi', aciklama: 'Açıklayan şirket sayısı' }, { ad: 'eldeki', aciklama: 'Elinizdekilerin satırları (📌)' }, { ad: 'liste', aciklama: 'En dikkat çekenlerin satırları' }, { ad: 'daha', aciklama: 'Listede olmayan şirket sayısı' }, { ad: 'not', aciklama: 'TMS 29 notu' }],
    ornekParca: P('🏛️', 'Bilanço özeti · 20:30 — 14 şirket açıkladı', ['📌 THYAO · 3Ç net kâr 31,2 milyar TL (geçen yıl 35,0 milyar TL, −%11) · satış +%6 — elinizde: Lydia (BIST M10)', 'ASELS · 3Ç net kâr 4,1 milyar TL (geçen yıl 2,9 milyar TL, +%41) · satış +%18', 'PETKM · 3Ç kârdan zarara: −1,2 milyar TL (geçen yıl 0,8 milyar TL)', 'KONTR · 3Ç zarardan kâra: 210,0 milyon TL (geçen yıl −95,0 milyon TL)', '10 şirket daha açıkladı.', 'TMS 29 dönemi: rakamlar enflasyon düzeltmeli (geçen yılın rakamı bugünkü alım gücüne taşınmış) · kaynak KAP.']),
    ornekDegisken: { saat: '20:30', sayi: '14', eldeki: ['📌 THYAO · 3Ç net kâr 31,2 milyar TL (geçen yıl 35,0 milyar TL, −%11) — elinizde: Lydia (BIST M10)'], liste: ['ASELS · 3Ç net kâr 4,1 milyar TL (geçen yıl 2,9 milyar TL, +%41)'], daha: '10', not: 'TMS 29 dönemi: rakamlar enflasyon düzeltmeli · kaynak KAP.' } },
  { id: 'tarama', grup: 'Araştırma ve sistem', ad: 'Coin tarama / Dikkat listesi', aciklama: 'Kaçın / izle listesine yeni coin girdiğinde', onem: 'bilgi',
    ornek: '⚠️ <b>Dikkat listesi 2026-10-24: 2 yeni coin</b>\n\nXYZ, ABC\n\n<i>🧭 Pusula · x</i>' },
  { id: 'ileri', grup: 'Araştırma ve sistem', ad: 'İleri test', aciklama: 'Bir ileri test uyarı ya da alarm eşiğini aştığında, demo kabul notları', onem: 'uyari',
    ornek: '⚠️ <b>Tao (demo): uygulama sapması İNCELE bandında</b>\n\nSon 30 g sapma %3.4\n\n<i>🧭 Pusula · x</i>' },
  { id: 'golge', grup: 'Araştırma ve sistem', ad: 'Gölge testler haftalık özeti', aciklama: 'Pazartesi sabahı tek mesaj, açıkça "🧪 GÖLGE TESTİ — gerçek para değil, emir yok": her gölgenin başlangıçtan / son 7 gün getirisi, aynı dönemde kıyası, işlem sayısı, bandı ve hüküm tarihi (yorum ve hüküm yazmaz)', onem: 'bilgi', uretici: true,
    degiskenler: [{ ad: 'hafta', aciklama: 'Hafta (2026-H43)' }, { ad: 'etiket', aciklama: 'Gölge testi uyarı satırı' }, { ad: 'liste', aciklama: 'Gölge başına satırlar' }, { ad: 'hukum', aciklama: 'En yakın hüküm / kontrol tarihi' }],
    ornekParca: P('🧪', 'GÖLGE TESTİ · haftalık ara sonuç (2026-H44)', ['🧪 GÖLGE TESTİ — gerçek para değil, emir yok; ara sonuçtur, hüküm değildir (hüküm tarihi: her satırın sonunda; en yakını 1 Oca 2027).', "🧪 GÖLGE · Kairos gölgesi (çalışan kural): 7 Eki'den beri −%6,9 · son 7 g −%0,3 · kıyas BTC al-tut −%5,1 (7 g −%0,5) · 17 gün · bant içinde (MaxDD %7,1 ≤ p95 %28,1, 90 g) · kontrol 5 Oca 2027", '🧪 GÖLGE · CBDR EUR/USD (864): toplam +0,11 R (R = stop mesafesi) · son 7 g +0,11 R · kıyas 0 R (hiç işlem yapmamak) · 7 gün, 1 işlem (1 kârlı) · hüküm 15 Eki 2027', 'Ayrıntı: İleri test.']),
    ornekDegisken: { hafta: '2026-H44', etiket: '🧪 GÖLGE TESTİ — gerçek para değil, emir yok; ara sonuçtur, hüküm değildir.', liste: ["🧪 GÖLGE · Kairos gölgesi (çalışan kural): 7 Eki'den beri −%6,9 · son 7 g −%0,3 · kontrol 5 Oca 2027"], hukum: '1 Oca 2027' } },
  { id: 'anahtar', grup: 'Araştırma ve sistem', ad: 'Anahtar sınaması başarısız', aciklama: 'Günde bir arka plan salt okuma sınaması (emir yok): bir borsa / İşlem defterim anahtarı bağlanamadıysa ya da para çekme izni açıksa', onem: 'uyari', uretici: true,
    degiskenler: [{ ad: 'anahtar', aciklama: 'Anahtarın adı' }, { ad: 'sorun', aciklama: 'Ne oldu' }],
    ornekParca: P('🔑', 'Anahtar sınaması: 1 sorun', ['Binance canlı: PARA ÇEKME izni açık.'], 'Ayarlar › Anahtarlar\'da anahtara bak; para çekme iznini borsada hemen kapat.'),
    ornekDegisken: { anahtar: 'Binance canlı', sorun: 'PARA ÇEKME izni açık' } },
  { id: 'makine', grup: 'Araştırma ve sistem', ad: 'Makine sessiz', aciklama: 'Sunucu bir süre kapalı kaldıysa (açılışta) ya da araştırma kopyası uzun süre sunucuya görünmediyse; yeniden görülünce bir kez daha', onem: 'uyari', uretici: true,
    degiskenler: [{ ad: 'makine', aciklama: 'Makine adı' }, { ad: 'sure', aciklama: 'Ne kadar sessiz' }, { ad: 'son_gorulme', aciklama: 'Son görülme' }],
    ornekParca: P('📡', 'Araştırma kopyası sessiz: GELISTIRME-PC', ['26 saattir sunucuya görünmedi (son: 23 Eki 21:40).'], 'Bilgisayar kapalıysa bir şey yapman gerekmiyor; açıksa Tailscale bağlantısına bak.'),
    ornekDegisken: { makine: 'GELISTIRME-PC', sure: '26 saat', son_gorulme: '23 Eki 21:40' } },
  { id: 'fiyat', grup: 'Araştırma ve sistem', ad: 'Sert fiyat hareketi', aciklama: 'İzlenen sembol (varsayılan BTC) kısa sürede eşikten fazla oynadığında (varsayılan 1 saatte ±%5); aynı yön 6 saatte bir', onem: 'uyari', uretici: true,
    degiskenler: [{ ad: 'sembol', aciklama: 'Sembol (BTCUSDT)' }, { ad: 'degisim', aciklama: 'Yüzde değişim' }, { ad: 'fiyat', aciklama: 'Son fiyat' }, { ad: 'pencere', aciklama: 'Süre (60 dk)' }],
    ornekParca: P('📉', 'BTCUSDT 60 dakikada −%5,4', ['Son fiyat 63.420 (60 dk içindeki en yüksek 67.050).', 'Botlar kendi kurallarıyla çalışmaya devam ediyor.']),
    ornekDegisken: { sembol: 'BTCUSDT', degisim: '−%5,4', fiyat: '63.420', pencere: '60 dk' } },
  { id: 'guncelleme', grup: 'Araştırma ve sistem', ad: 'Güncelleme', aciklama: 'Yeni sürüm onay bekliyor, elle bakılmalı ya da GitHub\'a ulaşılamıyor', onem: 'bilgi',
    ornek: 'ℹ️ <b>Pusula 73.6 kurulmayı bekliyor (onay)</b>\n\nCanlı kod değişti.\n\n<i>🧭 Pusula · x</i>' },
  { id: 'yedek', grup: 'Araştırma ve sistem', ad: 'Yedek', aciklama: 'Otomatik yedek alınamadığında', onem: 'uyari',
    ornek: '⚠️ <b>Pusula yedeği alınamadı</b>\n\nHedef: D:\\Yedek\n\n<i>🧭 Pusula · x</i>' },
  { id: 'diger', grup: 'Araştırma ve sistem', ad: 'Diğer', aciklama: 'Yukarıdaki türlere girmeyen mesajlar', onem: 'bilgi',
    ornek: 'ℹ️ <b>Araştırma eklentisi oluşturuldu</b>\n\nDosya masaüstünde.\n\n<i>🧭 Pusula · x</i>' },
  { id: 'deneme', grup: null, ad: 'Deneme mesajı', aciklama: 'Panelden gönderilen deneme', onem: 'bilgi', kilitli: true, gizli: true },
  { id: 'sessiz', grup: null, ad: 'Sessiz saat özeti', aciklama: 'Sessiz saatte bekletilen bildirimlerin özeti', onem: 'bilgi', kilitli: true, gizli: true },
];
const TURLER = new Set(KATALOG.map(t => t.id));
const KRITIK = KATALOG.filter(t => t.kilitli && !t.gizli).map(t => t.id);
const KANALLAR = ['telegram', 'ntfy', 'ikisi'];
const SESSIZ_KIPLER = ['ozet', 'dusur', 'gonder'];
const URETICI_VARSAYILAN = Object.freeze({
  fiyat: Object.freeze({ semboller: Object.freeze(['BTCUSDT']), esikYuzde: 5, pencereDk: 60, tekrarSaat: 6 }),
  makine: Object.freeze({ esikSaat: 24, sunucuEsikDk: 30 }),
  // 73.6: bilanço özeti — evren 'elde' | 'bist100' | 'tum', günde en çok 2 mesaj saati, mesaj başına satır (elde olanlar sınır dışında da yazılır)
  bilanco: Object.freeze({ evren: 'bist100', saatler: Object.freeze(['13:00', '20:30']), satir: 8 }),
});
const BILANCO_EVRENLERI = ['elde', 'bist100', 'tum'];
const SESSIZ_VARSAYILAN = Object.freeze({ acik: false, bas: '23:00', bit: '08:00' });
const GECIKME_RE = /^(⏳ <i>\[gecikmeli[^\]\n]*\]<\/i>)\n/;
const KORUMA_RE = /felaket stopu|koruma stopu/i;
const ENGEL_RE = /ENGEL —|EMİR FRENİ|güvenli kip|yürütücü DURDURULDU|mutabakat uyuşmazlığı|hesap kesicisi/;
const GUVENLIK_RE = /PIN kilitlendi|acil durdurma kilitlendi|GERÇEK PARA (moduna geçildi|emir onayı)|dış IP adresi değişti|Ayar dosyası bozuk|\.git\/config değişti/;

/** Saf: HTML'siz ilk satır (başlık). */
function baslikAyir(metin) {
  const ilk = String(metin || '').split('\n').find(s => s.trim()) || '';
  return ilk.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim().slice(0, 200);
}

/** Saf: metin → katalog türü. Sıra: deneme → güvenlik → 🚨 (koruma / engel / acil) → alan kuralları → simge. Giden kutusunun "[gecikmeli …]" öneki atlanır. */
function siniflandir(metin) {
  const t = String(metin || '').replace(GECIKME_RE, '');
  const b = baslikAyir(t);
  if (/Test Bildirimi|Deneme mesajı/i.test(b)) return 'deneme';
  if (GUVENLIK_RE.test(b)) return 'guvenlik';
  if (/^🚨/.test(b)) return KORUMA_RE.test(b) ? 'koruma' : ENGEL_RE.test(b) ? 'engel' : 'acil';
  if (/^📋|[Gg]ünlük rapor|[Hh]aftalık (rapor|özet)/.test(b)) return 'rapor';
  if (/Dikkat listesi|Coin tarama|KAÇIN|İzle listesi/.test(b)) return 'tarama';
  if (/İleri test|876|CBDR|Bollinger|[Dd]emo kabul|gerçekleşen vs gölge|uygulama sapması/.test(b)) return 'ileri';
  if (/Pusula güncellemesi|kurulmayı bekliyor|Pusula [\d.]+ (kuruldu|kurulamadı)/.test(b)) return 'guncelleme';
  if (/[Yy]edek/.test(b)) return 'yedek';
  if (/alım-satım \(kâğıt hesap\)|uygulama günü|[Bb]u ay(ın)? emir/.test(b)) return 'model';
  if (/^💱|^🟢|^🔴|TRADE ALERT/.test(b)) return 'islem';
  if (/^📊/.test(b)) return 'ozet';
  if (/^⚠️|^⚠/.test(b)) return 'hata';
  if (/^ℹ️|^ℹ/.test(b)) return 'yasam';
  return 'diger';
}

/** Saf: tür için tanınan değişken adları. */
function degiskenAdlari(tur) {
  const k = KATALOG.find(x => x.id === tur);
  return [...GENEL_DEGISKEN.map(d => d.ad), ...((k && k.degiskenler) || []).map(d => d.ad)];
}

/** Saf: "23:30" → dakika (geçersiz → null). */
function dakika(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
/** Saf: İstanbul saatiyle günün dakikası. */
function istanbulDakika(simdi = Date.now()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(simdi));
  const g = (t) => Number((p.find(x => x.type === t) || {}).value || 0);
  return g('hour') * 60 + g('minute');
}
/** Saf: sessiz pencere içinde mi (gece yarısını aşan pencere dahil). */
function sessizIcinde(sessiz, simdi = Date.now()) {
  if (!sessiz || !sessiz.acik) return false;
  const a = dakika(sessiz.bas), b = dakika(sessiz.bit);
  if (a == null || b == null || a === b) return false;
  const d = istanbulDakika(simdi);
  return a < b ? d >= a && d < b : d >= a || d < b;
}

const nesne = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const hata400 = (m) => Object.assign(new Error(m), { durum: 400 });

/** Saf: eski düz biçim { tur: bool } → 73.5 biçimi. */
function ayarDonustur(j) {
  const a = nesne(j);
  if (a.surum === 2) return { surum: 2, turler: nesne(a.turler), sessiz: { ...SESSIZ_VARSAYILAN, ...nesne(a.sessiz) }, uretici: nesne(a.uretici) };
  const turler = {};
  for (const [k, v] of Object.entries(a)) if (TURLER.has(k) && typeof v === 'boolean') turler[k] = { acik: v };
  return { surum: 2, turler, sessiz: { ...SESSIZ_VARSAYILAN }, uretici: {} };
}

function olustur(o = {}) {
  const kok = o.kok || path.join(__dirname, '..');
  const ayarDosya = o.ayarDosya || yollar.programVeri(kok, 'bildirim-ayar.json');
  const gecmisDosya = o.gecmisDosya || yollar.programVeri(kok, 'bildirim-gecmis.jsonl');
  const bekleyenDosya = o.bekleyenDosya || yollar.programVeri(kok, 'bildirim-bekleyen.jsonl');
  const varsayilan = typeof o.varsayilan === 'function' ? o.varsayilan : () => ({});
  const ntfyFn = typeof o.ntfyFn === 'function' ? o.ntfyFn : () => null;          // () → { konu, sunucu? } | null (secrets.json ikinciKanal)
  const engelFn = typeof o.engelFn === 'function' ? o.engelFn : () => null;       // () → metin | null (geliştirme bilgisayarı: gönderim yok)
  const fetchFn = o.fetchFn || ((...a) => fetch(...a));
  const simdiFn = o.simdi || (() => Date.now());
  const GECMIS_TAVAN = 1000;
  let ayar;
  try { ayar = ayarDonustur(JSON.parse(fs.readFileSync(ayarDosya, 'utf8'))); } catch (e) { ayar = ayarDonustur({}); }
  let gecmis = [];
  try { gecmis = fs.readFileSync(gecmisDosya, 'utf8').split('\n').filter(Boolean).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean).slice(-GECMIS_TAVAN); } catch (e) { gecmis = []; }
  const ntfySon = new Map();   // çift ntfy önleme: başlık anahtarı → zaman (Bildirici'nin kendi ntfy'ı ile)

  const katalogOge = (tur) => KATALOG.find(x => x.id === tur) || null;
  const turAyar = (tur) => nesne(ayar.turler[tur]);

  function yaz() {
    fs.mkdirSync(path.dirname(ayarDosya), { recursive: true });
    const gecici = ayarDosya + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(ayar, null, 2), 'utf8');
    fs.renameSync(gecici, ayarDosya);
  }

  function acikMi(tur) {
    const k = katalogOge(tur);
    if (!k || k.kilitli) return true;
    const t = turAyar(tur);
    if (typeof t.acik === 'boolean') return t.acik;
    const v = varsayilan();
    return Object.hasOwn(v, tur) ? v[tur] !== false : true;
  }
  function kanalOf(tur) {
    const k = katalogOge(tur);
    const v = turAyar(tur).kanal;
    if (!KANALLAR.includes(v)) return 'telegram';
    return k && k.kilitli && v === 'ntfy' ? 'ikisi' : v;
  }
  function sessizKipOf(tur) {
    const k = katalogOge(tur);
    if (!k || k.kilitli) return 'gonder';
    const v = turAyar(tur).sessiz;
    return SESSIZ_KIPLER.includes(v) ? v : 'ozet';
  }
  const metinOf = (tur) => { const v = turAyar(tur).metin; return typeof v === 'string' && v.trim() ? v : ''; };
  const ntfyAyarli = () => { try { const k = ntfyFn(); return !!(k && k.konu); } catch (e) { return false; } };
  const sessizSimdi = (simdi = simdiFn()) => sessizIcinde(ayar.sessiz, simdi);

  /** Eski uç: yalnız aç/kapat. */
  function ayarla(tur, acik) { turAyarla(tur, { acik: !!acik }); return acikMi(tur); }

  /** 73.5: { acik?, metin?, kanal?, sessiz? } — kritik türde kapatma 400; metin '' → varsayılan. */
  function turAyarla(tur, g = {}) {
    const k = katalogOge(tur);
    if (!k || k.gizli) throw Object.assign(new Error(`Bilinmeyen bildirim türü: ${tur}`), { durum: 400 });
    const yeni = { ...turAyar(tur) };
    const uyarilar = [];
    if ('acik' in g) {
      if (k.kilitli && !(g.acik === true || g.acik === 'true')) throw hata400(`"${k.ad}" kapatılamaz.`);
      if (!k.kilitli) yeni.acik = g.acik === true || g.acik === 'true';
    }
    if ('kanal' in g) {
      if (!KANALLAR.includes(g.kanal)) throw hata400('Kanal telegram, ntfy ya da ikisi olmalı.');
      if (k.kilitli && g.kanal === 'ntfy') throw hata400(`"${k.ad}" kritik: Telegram her zaman açık kalır (yalnız "ikisi" seçilebilir).`);
      yeni.kanal = g.kanal;
      if (g.kanal !== 'telegram' && !ntfyAyarli()) uyarilar.push('ntfy kurulu değil — kurulana kadar bu tür Telegram\'dan gider (Sağlık › İkinci uyarı kanalı).');
    }
    if ('sessiz' in g && !k.kilitli) {
      if (!SESSIZ_KIPLER.includes(g.sessiz)) throw hata400('Sessiz saat davranışı ozet, dusur ya da gonder olmalı.');
      yeni.sessiz = g.sessiz;
    }
    if ('metin' in g) {
      const m = String(g.metin == null ? '' : g.metin).replace(/\r\n?/g, '\n');
      if (!m.trim()) delete yeni.metin;
      else {
        const h = BM.sablonDenetle(m);
        if (h) throw hata400(h);
        const bilinmeyen = BM.sablonDegiskenleri(m).filter(a => !degiskenAdlari(tur).includes(a));
        if (bilinmeyen.length) uyarilar.push(`Bilinmeyen değişken: ${bilinmeyen.map(a => `{${a}}`).join(', ')} — düzeltilene kadar bu tür varsayılan metinle gider.`);
        yeni.metin = m;
      }
    }
    ayar = { ...ayar, turler: { ...ayar.turler, [tur]: yeni } };
    yaz();
    return { tur, acik: acikMi(tur), kanal: kanalOf(tur), sessiz: sessizKipOf(tur), metin: metinOf(tur), uyarilar };
  }

  function sessizAyarla(g = {}) {
    const s = { ...ayar.sessiz };
    if ('acik' in g) s.acik = g.acik === true || g.acik === 'true';
    for (const a of ['bas', 'bit']) if (a in g) { if (dakika(g[a]) == null) throw hata400('Saat SS:DD biçiminde olmalı (ör. 23:00).'); s[a] = g[a]; }
    if (dakika(s.bas) === dakika(s.bit)) throw hata400('Başlangıç ve bitiş aynı olamaz.');
    ayar = { ...ayar, sessiz: s };
    yaz();
    return { ...s };
  }

  /** Üretici ayarı (varsayılanla birleşik). */
  function uretici(ad) { return { ...(URETICI_VARSAYILAN[ad] || {}), ...nesne(ayar.uretici[ad]) }; }
  function ureticiAyarla(g = {}) {
    const u = { ...ayar.uretici };
    if (g.fiyat) {
      const f = { ...uretici('fiyat') }, x = nesne(g.fiyat);
      if ('semboller' in x) {
        const l = (Array.isArray(x.semboller) ? x.semboller : String(x.semboller || '').split(/[\s,;]+/)).map(s => String(s).trim().toUpperCase()).filter(Boolean);
        const kotu = l.find(s => !/^[A-Z0-9]{2,15}USDT$/.test(s));
        if (kotu) throw hata400(`Sembol Binance spot biçiminde olmalı (ör. BTCUSDT): ${kotu.slice(0, 20)}`);
        if (!l.length || l.length > 10) throw hata400('1 ile 10 arasında sembol girin.');
        f.semboller = [...new Set(l)];
      }
      const sayiAl = (ad, en, ust, ne) => { if (!(ad in x)) return; const v = Number(String(x[ad]).replace(',', '.')); if (!Number.isFinite(v) || v < en || v > ust) throw hata400(`${ne} ${en}–${ust} arasında olmalı.`); f[ad] = v; };
      sayiAl('esikYuzde', 1, 50, 'Eşik (%)'); sayiAl('pencereDk', 5, 1440, 'Süre (dk)'); sayiAl('tekrarSaat', 1, 72, 'Tekrar (saat)');
      f.pencereDk = Math.max(5, Math.round(f.pencereDk / 5) * 5);
      u.fiyat = f;
    }
    if (g.makine) {
      const m = { ...uretici('makine') }, x = nesne(g.makine);
      if ('esikSaat' in x) { const v = Number(x.esikSaat); if (!Number.isFinite(v) || v < 1 || v > 168) throw hata400('Araştırma kopyası eşiği 1–168 saat olmalı.'); m.esikSaat = v; }
      if ('sunucuEsikDk' in x) { const v = Number(x.sunucuEsikDk); if (!Number.isFinite(v) || v < 10 || v > 1440) throw hata400('Sunucu eşiği 10–1440 dakika olmalı.'); m.sunucuEsikDk = v; }
      u.makine = m;
    }
    if (g.bilanco) {
      const b = { ...uretici('bilanco') }, x = nesne(g.bilanco);
      if ('evren' in x) { if (!BILANCO_EVRENLERI.includes(x.evren)) throw hata400('Bilanço evreni: elde, bist100 ya da tum olmalı.'); b.evren = x.evren; }
      if ('saatler' in x) {
        const l = (Array.isArray(x.saatler) ? x.saatler : String(x.saatler || '').split(/[\s,;]+/)).map(s => String(s).trim()).filter(Boolean).map(s => s.padStart(5, '0'));
        if (!l.length || l.length > 2) throw hata400('Bilanço mesajı için 1 ya da 2 saat girin (ör. 13:00, 20:30).');
        for (const s of l) { const dk = dakika(s); if (dk == null || dk < 8 * 60 || dk > 23 * 60 + 30) throw hata400(`Saat SS:DD biçiminde, 08:00–23:30 arasında olmalı: ${s.slice(0, 10)}`); }
        b.saatler = [...new Set(l)].sort();
      }
      if ('satir' in x) { const v = Number(x.satir); if (!Number.isInteger(v) || v < 3 || v > 15) throw hata400('Bilanço satır sayısı 3–15 arasında olmalı.'); b.satir = v; }
      u.bilanco = b;
    }
    ayar = { ...ayar, uretici: u };
    yaz();
    return { fiyat: uretici('fiyat'), makine: uretici('makine'), bilanco: uretici('bilanco') };
  }

  /** Örnek parçalar (önizleme). */
  function ornek(tur, simdi = new Date(simdiFn())) {
    const k = katalogOge(tur);
    if (!k) return null;
    if (k.ornekParca) return { parcalar: { ...k.ornekParca, zaman: BM.kisaZaman(simdi), bot: '' }, degiskenler: k.ornekDegisken || {} };
    const p = BM.ayristir(k.ornek || '', { simdi });
    return { parcalar: p || BM.kabaParcalar(k.ornek || '', { simdi }), ham: k.ornek, tanindi: !!p, degiskenler: {} };
  }

  /** Saf çekirdek: parçalar + şablon → metin. */
  function sablonUygula(tur, sablon, parcalar, ekDeg, varsayilanMetin) {
    const p = parcalar;
    const deg = { simge: p.simge || '', baslik: p.baslik || '', govde: p.govde || [], ne_yapmali: p.ne || '', zaman: p.zaman || BM.kisaZaman(new Date(simdiFn())),
      bot: p.bot || '', mesaj: varsayilanMetin, ...nesne(ekDeg) };
    return BM.sablonla(sablon, deg, degiskenAdlari(tur));
  }

  /** Önizleme: { ok, metin, duz, bilinmeyen, hata, varsayilan } — metin boşsa varsayılan. */
  function onizle(tur, metin) {
    const k = katalogOge(tur);
    if (!k || k.gizli) throw hata400(`Bilinmeyen bildirim türü: ${tur}`);
    const o2 = ornek(tur);
    const vars = o2.ham ? (o2.tanindi ? BM.bicimle(o2.ham, { simdi: new Date(simdiFn()) }) : o2.ham) : BM.varsayilanKur(o2.parcalar);
    const m = String(metin == null ? '' : metin);
    if (!m.trim()) return { ok: true, metin: vars, duz: BM.duz(vars), bilinmeyen: [], hata: null, varsayilan: true };
    const r = sablonUygula(tur, m, o2.parcalar, o2.degiskenler, vars);
    const bilinmeyen = BM.sablonDegiskenleri(m).filter(a => !degiskenAdlari(tur).includes(a));
    if (!r.ok) return { ok: false, metin: vars, duz: BM.duz(vars), bilinmeyen, hata: r.hata, varsayilan: true };
    return { ok: true, metin: r.metin, duz: BM.duz(r.metin), bilinmeyen: [], hata: null, varsayilan: false };
  }

  /**
   * GÖNDERİM KARARI (lib/telegram.js sendMessageDetailed çağırır). @param s { tur?, parcalar?, degiskenler? } (73.5 üreticiler türü verir)
   * @returns { tur, karar: 'gonder'|'kapali'|'bekle'|'dusur', metin, varsayilanMetin, ozel, sablonHata, kanallar: { telegram, ntfy }, ntfy: { baslik, govde, oncelik }, anahtar }
   */
  function hazirla(metin, s = {}) {
    const ham = String(metin || '');
    const gm = GECIKME_RE.exec(ham);
    const govdeMetin = gm ? ham.slice(gm[0].length) : ham;
    const tur = s.tur && TURLER.has(s.tur) ? s.tur : siniflandir(govdeMetin);
    const k = katalogOge(tur) || {};
    const simdi = simdiFn();
    const anahtar = baslikAyir(govdeMetin).replace(/^[^\p{L}\p{N}]+/u, '').trim().slice(0, 120);
    const temel = { tur, anahtar, kritik: !!k.kilitli };
    if (!acikMi(tur)) return { ...temel, karar: 'kapali', metin: ham };
    const sk = sessizKipOf(tur);
    let karar = 'gonder';
    if (sk !== 'gonder' && tur !== 'deneme' && tur !== 'sessiz' && sessizSimdi(simdi)) karar = sk === 'ozet' ? 'bekle' : 'dusur';
    const parcalar = s.parcalar ? { zaman: BM.kisaZaman(new Date(simdi)), ...s.parcalar } : BM.ayristir(govdeMetin, { simdi: new Date(simdi) });
    const varsayilanMetin = s.parcalar ? BM.varsayilanKur(parcalar) : (tur === 'deneme' ? govdeMetin : BM.bicimle(govdeMetin, { simdi: new Date(simdi) }));
    let son = varsayilanMetin, ozel = false, sablonHata = null;
    const sablon = tur === 'deneme' || tur === 'sessiz' ? '' : metinOf(tur);
    if (sablon) {
      const r = sablonUygula(tur, sablon, parcalar || BM.kabaParcalar(govdeMetin, { simdi: new Date(simdi) }), s.degiskenler, varsayilanMetin);
      if (r.ok) { son = r.metin; ozel = true; } else sablonHata = r.hata;   // bilinmeyen değişken / bozuk şablon → varsayılan metin
    }
    const onek = gm ? gm[1] + '\n' : '';
    const kanal = kanalOf(tur);
    const ntfyVar = ntfyAyarli();
    const kanallar = { telegram: kanal !== 'ntfy' || !ntfyVar, ntfy: kanal !== 'telegram' && ntfyVar };
    const baslikDuz = BM.duz(parcalar ? parcalar.baslik : baslikAyir(govdeMetin)).trim() || anahtar;
    const satirlar = BM.duz(son).split('\n');
    return { ...temel, karar, metin: onek + son, varsayilanMetin: onek + varsayilanMetin, ozel, sablonHata, kanallar,
      ntfy: { baslik: `Pusula: ${baslikDuz}`.slice(0, 180), govde: `${gm ? '(gecikmeli) ' : ''}${satirlar.slice(1).join('\n')}`.trim().slice(0, 3500) || baslikDuz,
        oncelik: k.kilitli ? 5 : k.onem === 'uyari' ? 4 : 3 } };
  }

  /** ntfy yayını (Bildirici'deki 69.4 biçimi). Geliştirme bilgisayarında göndermez. Hata atmaz. */
  async function ntfyGonder(h) {
    let k = null;
    try { k = ntfyFn(); } catch (e) { k = null; }
    if (!k || !k.konu) return { ok: false, atlandi: true, hata: 'ntfy kurulu değil' };
    const engel = engelFn();
    if (engel) return { ok: false, atlandi: true, hata: `geliştirme bilgisayarı — ntfy kapalı (${engel})` };
    const sunucu = String(k.sunucu || 'https://ntfy.sh').replace(/\/+$/, '');
    try {
      const y = await fetchFn(sunucu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ topic: k.konu, title: h.ntfy.baslik, message: h.ntfy.govde, priority: h.ntfy.oncelik, tags: [h.ntfy.oncelik >= 5 ? 'rotating_light' : h.ntfy.oncelik >= 4 ? 'warning' : 'bell'] }) });
      const ok = !!(y && y.ok);
      if (ok && h.anahtar) ntfySon.set(h.anahtar, simdiFn());
      return ok ? { ok: true } : { ok: false, hata: `HTTP ${y && y.status}` };
    } catch (e) { return { ok: false, hata: String(e.message || e).slice(0, 200) }; }
  }

  /**
   * Bildirici'nin (lib/live/isletim.js) kendi ntfy yayınına verilen fetch'i sarar: aynı başlık merkezden 2 dk içinde zaten ntfy'a
   * gittiyse ikinci yayın yapılmaz ("tamam" döner). Bildirici kodu değişmez; yalnız server.js ona bu fetch'i verir.
   */
  function ntfyFetchSarmala(asil = fetchFn) {
    return async (url, ops = {}) => {
      try {
        const b = JSON.parse(ops.body || '{}');
        const a = String(b.title || '').replace(/^Pusula:\s*/, '').replace(/^[^\p{L}\p{N}]+/u, '').trim().slice(0, 120);
        const z = ntfySon.get(a);
        if (z && simdiFn() - z < 120000) return { ok: true, status: 200, cift: true };
      } catch (e) { /* çözülemedi: asıl gönderim */ }
      return asil(url, ops);
    };
  }

  /** Sessiz saatte bekletilen bildirim (yalnız özet bilgisi: tür, başlık, ilk satır, kanallar). */
  function beklet(h) {
    const satirlar = BM.duz(h.metin).split('\n').map(s => s.trim()).filter(Boolean);
    const k = { zaman: new Date(simdiFn()).toISOString(), tur: h.tur, baslik: (satirlar[0] || h.anahtar || '').slice(0, 160), ilk: (satirlar[1] || '').slice(0, 200), kanallar: h.kanallar };
    try { fs.mkdirSync(path.dirname(bekleyenDosya), { recursive: true }); fs.appendFileSync(bekleyenDosya, JSON.stringify(k) + '\n'); } catch (e) { /* yazılamadı */ }
    return k;
  }
  function bekleyenler() {
    try { return fs.readFileSync(bekleyenDosya, 'utf8').split('\n').filter(Boolean).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; }
  }

  /** Saf: bekleyenler → özet mesajı (HTML). */
  function sessizOzetMetni(l, simdi = simdiFn()) {
    const saat = (iso) => new Date(iso).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
    const ad = (t) => (katalogOge(t) || {}).ad || t;
    const TAVAN = 25;
    const satirlar = l.slice(0, TAVAN).map(x => `• ${saat(x.zaman)} · ${BM.kacir(ad(x.tur))} — ${BM.kacir(x.baslik)}${x.ilk ? `: ${BM.kacir(x.ilk)}` : ''}`);
    if (l.length > TAVAN) satirlar.push(`… ve ${l.length - TAVAN} bildirim daha (Sistem › Bildirimler › Son gönderilenler).`);
    return [`🌙 <b>Sessiz saatte ${l.length} bildirim bekletildi</b>`, ...satirlar, `<i>Pusula · ${BM.kisaZaman(new Date(simdi))}</i>`].join('\n');
  }

  /**
   * Sessiz saat bittiyse bekleyenleri TEK özet olarak yollar (yalnız sunucu, dakikada bir çağırır).
   * @param g { telegram: async (metin) → { ok, error? }, ntfy?: async (h) → { ok } }
   */
  let bosaltMesgul = false;
  async function sessizBosalt(g = {}) {
    if (bosaltMesgul || sessizSimdi()) return { gonderilen: 0 };
    const l = bekleyenler();
    if (!l.length) return { gonderilen: 0 };
    bosaltMesgul = true;
    try {
      const metin = sessizOzetMetni(l);
      const tg = l.some(x => !x.kanallar || x.kanallar.telegram), nt = l.some(x => x.kanallar && x.kanallar.ntfy);
      let ok = true, hataMetni = null;
      if (tg && g.telegram) { const r = await g.telegram(metin); ok = !!(r && r.ok); hataMetni = r && r.error; }
      if (nt) {
        const h = { anahtar: null, ntfy: { baslik: `Pusula: sessiz saatte ${l.length} bildirim`, govde: BM.duz(metin).split('\n').slice(1, -1).join('\n').slice(0, 3500), oncelik: 3 } };
        const r = await (g.ntfy ? g.ntfy(h) : ntfyGonder(h));
        if (!tg) { ok = !!(r && r.ok); hataMetni = r && r.hata; }
      }
      kaydet({ tur: 'sessiz', metin, sonuc: ok ? 'gonderildi' : 'hata', hata: ok ? null : hataMetni, kanal: tg && nt ? 'ikisi' : nt ? 'ntfy' : 'telegram' });
      if (ok) { try { fs.writeFileSync(bekleyenDosya, ''); } catch (e) { /* */ } }
      return { gonderilen: ok ? l.length : 0 };
    } finally { bosaltMesgul = false; }
  }

  /** Bir denemeyi kaydeder: sonuc 'gonderildi' | 'kapali' | 'hata' | 'bekletildi' | 'dusuruldu'. */
  function kaydet(k) {
    const satir = { zaman: new Date(simdiFn()).toISOString(), tur: k.tur, baslik: baslikAyir(k.metin), sonuc: k.sonuc, hata: k.hata ? String(k.hata).slice(0, 300) : null };
    if (k.kanal) satir.kanal = k.kanal;
    if (k.ozel) satir.ozel = true;
    gecmis.push(satir);
    if (gecmis.length > GECMIS_TAVAN) gecmis = gecmis.slice(-GECMIS_TAVAN);
    try {
      fs.mkdirSync(path.dirname(gecmisDosya), { recursive: true });
      fs.appendFileSync(gecmisDosya, JSON.stringify(satir) + '\n');
      // Dosya tavanın iki katına ulaşınca kırpılır (yalnız son 1000 satır kalır).
      if (gecmis.length === GECMIS_TAVAN && fs.statSync(gecmisDosya).size > 400 * 1024) fs.writeFileSync(gecmisDosya, gecmis.map(x => JSON.stringify(x)).join('\n') + '\n');
    } catch (e) { /* kayıt yazılamadı — gönderim etkilenmez */ }
    return satir;
  }

  /** Ekran: katalog + ayarlar + önizleme + son gönderim, son mesajlar, sessiz saat, üreticiler. */
  function gorunum(n = 50) {
    const son = {};
    for (const g of gecmis) if (g.sonuc === 'gonderildi') son[g.tur] = g.zaman;
    return {
      surum: 2,
      katalog: KATALOG.filter(k => !k.gizli).map(k => {
        const { ornek: _o, ornekParca: _p, ornekDegisken: _d, ...gorunen } = k;   // eslint-disable-line no-unused-vars
        const metin = metinOf(k.id);
        const on = onizle(k.id, metin);
        return { ...gorunen, kritik: !!k.kilitli, acik: acikMi(k.id), kanal: kanalOf(k.id), sessiz: sessizKipOf(k.id), metin, onizleme: on.metin, sablonHata: metin && !on.ok ? on.hata : null,
          degiskenler: [...GENEL_DEGISKEN, ...(k.degiskenler || [])], sonGonderim: son[k.id] || null };
      }),
      varsayilanSablon: BM.VARSAYILAN_SABLON,
      sessiz: { ...ayar.sessiz, simdi: sessizSimdi(), bekleyen: bekleyenler().length },
      uretici: { fiyat: uretici('fiyat'), makine: uretici('makine'), bilanco: uretici('bilanco') },
      ntfy: { ayarli: ntfyAyarli() },
      kritikTurler: KRITIK.slice(),
      gecmis: gecmis.slice(-n).reverse(),
    };
  }

  /** Sade metin (lib/bildirimMetinleri.js; kullanıcı kararı 2026-10-19). Hata olursa mesaj aynen gider. */
  function bicimle(metin) { try { return BM.bicimle(metin); } catch (e) { return metin; } }

  return { siniflandir, acikMi, ayarla, turAyarla, sessizAyarla, ureticiAyarla, uretici, onizle, hazirla, ntfyGonder, ntfyAyarli, ntfyFetchSarmala,
    beklet, bekleyenler, sessizBosalt, sessizOzetMetni, sessizSimdi, kaydet, gorunum, bicimle, kanalOf, sessizKipOf, metinOf };
}

/**
 * Express yönlendiricisi. GET /api/bildirim (katalog + ayarlar + geçmiş + Telegram durumu + üretici durumu),
 * POST /api/bildirim/ayar { tur, acik } · /tur { tur, acik?, metin?, kanal?, sessiz? } · /sessiz { acik?, bas?, bit? } ·
 * /uretici { fiyat?, makine? } · /onizle { tur, metin } (yan etkisiz). Telefonda POST'ları güvenlik katmanı 403 ile reddeder.
 * @param m merkez · @param o { durum: () => { bagli, neden }, ek: () => object (üretici durumu), log }
 */
function router(m, o = {}) {
  const express = require('express');
  const r = express.Router();
  const hata = (res, e) => res.status(e.durum || 500).json({ success: false, error: String(e.message).slice(0, 300) });
  r.get('/api/bildirim', (req, res) => {
    try {
      let ek = null;
      try { ek = o.ek ? o.ek() : null; } catch (e) { ek = { hata: e.message }; }
      res.json({ success: true, ...m.gorunum(Number((req.query || {}).n) || 50), telegram: o.durum ? o.durum() : null, ureticiDurum: ek });
    } catch (e) { hata(res, e); }
  });
  const govde = express.json({ limit: '16kb' });
  r.post('/api/bildirim/ayar', govde, (req, res) => {
    try {
      const b = req.body || {};
      const acik = m.ayarla(String(b.tur || ''), b.acik === true || b.acik === 'true');
      if (o.log) o.log('INFO', `🔔 Bildirim merkezi: "${b.tur}" ${acik ? 'açıldı' : 'kapatıldı'}`);
      res.json({ success: true, tur: b.tur, acik });
    } catch (e) { hata(res, e); }
  });
  r.post('/api/bildirim/tur', govde, (req, res) => {
    try {
      const b = req.body || {};
      const g = {};
      for (const a of ['acik', 'metin', 'kanal', 'sessiz']) if (a in b) g[a] = b[a];
      const s = m.turAyarla(String(b.tur || ''), g);
      if (o.log) o.log('INFO', `🔔 Bildirim merkezi: "${s.tur}" — ${Object.keys(g).map(a => (a === 'metin' ? (s.metin ? 'metin değişti' : 'metin varsayılana döndü') : `${a}=${s[a]}`)).join(', ')}`);
      res.json({ success: true, ...s });
    } catch (e) { hata(res, e); }
  });
  r.post('/api/bildirim/sessiz', govde, (req, res) => {
    try {
      const s = m.sessizAyarla(req.body || {});
      if (o.log) o.log('INFO', `🔔 Bildirim merkezi: sessiz saat ${s.acik ? `${s.bas}–${s.bit}` : 'kapalı'}`);
      res.json({ success: true, sessiz: s });
    } catch (e) { hata(res, e); }
  });
  r.post('/api/bildirim/uretici', govde, (req, res) => {
    try {
      const u = m.ureticiAyarla(req.body || {});
      if (o.log) o.log('INFO', `🔔 Bildirim merkezi: üretici ayarı — fiyat ${u.fiyat.semboller.join(',')} ±%${u.fiyat.esikYuzde}/${u.fiyat.pencereDk} dk · makine ${u.makine.esikSaat} sa`);
      res.json({ success: true, uretici: u });
    } catch (e) { hata(res, e); }
  });
  r.post('/api/bildirim/onizle', govde, (req, res) => {
    try { const b = req.body || {}; res.json({ success: true, ...m.onizle(String(b.tur || ''), b.metin) }); } catch (e) { hata(res, e); }
  });
  return r;
}

module.exports = { olustur, siniflandir, baslikAyir, router, degiskenAdlari, sessizIcinde, istanbulDakika, ayarDonustur, KATALOG, TURLER, KRITIK, GENEL_DEGISKEN, URETICI_VARSAYILAN };
