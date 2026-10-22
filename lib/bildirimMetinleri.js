/**
 * BİLDİRİM METİNLERİ — Telegram'a giden mesajların sade Türkçe biçimi (kullanıcı kararı 2026-10-19: karşılaştırma sayfasındaki
 * öneri; sen dili, kısa cümle, uyarı ve acil mesajlarda "Ne yapmalı" satırı; gece bildirimleri bekletilmez)
 * ═══════════════════════════════════════════════════════════════════════════
 * Mesajlar bot kodunda (lib/live, lib/engine, server.js) yazılıyor ve bot koduna dokunulmuyor. Bu modül bildirim merkezinin
 * kapısında (lib/telegram.js sendMessageDetailed → merkez.bicimle) çalışır: mesajı parçalar
 *   "<simge> <b>Bot (mod): olay</b>\n\n<gövde>\n\n<i>🧭 Pusula · gg.aa.yyyy ss:dd:sn</i>"
 * ve yeniden kurar:
 *   "<simge> <b>Bot · sade başlık</b>\n<sade gövde>\n<b>Ne yapmalı:</b> …\n<i>Pusula · 19 Eki 03:02</i>"
 * KURALLAR olay metnine göre (SAF). Tanınmayan mesaj: başlık "Bot · olay", iç belge adları silinir, saat kısalır — içerik aynen.
 * Mod etiketi yalnız canlı hesapta yazılır ("Hücum (canlı)"). Rapor (📋) ve deneme mesajları dokunulmadan geçer.
 * İleride panelden düzenleme (PLAN-PANEL-2 §0.3 "sonra") bu katalog üzerine kurulur.
 */
'use strict';

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const BOT_RE = /^(.+?) \((demo|kâğıt|GERÇEK PARA)\): (.+)$/s;
const BOT_YALIN_RE = /^(Kairos|Tao|Hücum|Denge|Kalkan|Donchian): (.+)$/s;   // 72.0: eski adlar (Hücum/Denge) eski kayıtlarda
const BA = require('./botAdlari');

/** "4999.29" → "4.999,29" (ondalık basamak korunur). Sayı değilse aynen. */
function sayi(s) {
  const t = String(s).trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return t;
  const b = (t.split('.')[1] || '').length;
  return Number(t).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
}
/** Metindeki "%3.40", "1.10 puan" gibi ondalıkları Türkçeye çevirir (sürüm numarası, tarih, sembol dokunulmaz). */
const ondalik = (s) => String(s).replace(/(%|−|-|\b)(\d+)\.(\d+)(?=\s*(puan|USDT|%|$|\)|,|\s))/g, (m, on, a, b) => on + sayi(a + '.' + b));
/** İç belge adları kullanıcıya görünmez: "(PLAN-GERCEK-PARA-2027 §4)", "PLAN-X.md §2". */
const belgesiz = (s) => String(s).replace(/\s*\((?:bkz\.\s*)?PLAN-[A-Z0-9-]+(?:\.md)?(?:\s*§[\w.–-]+)?\)/g, '').replace(/PLAN-[A-Z0-9-]+(?:\.md)?(?:\s*§[\w.–-]+)?/g, '').replace(/\s{2,}/g, ' ').trim();
const buyuk = (s) => { const t = String(s || ''); return t ? t.charAt(0).toLocaleUpperCase('tr-TR') + t.slice(1) : t; };
const nokta = (s) => { const t = String(s || '').trim(); return !t || /[.!?…:)]$/.test(t) ? t : t + '.'; };

/** "19 Eki 03:02" */
function kisaZaman(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${AYLAR[d.getMonth()]} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const gunKisa = (g) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(g || ''); return m ? `${Number(m[3])} ${AYLAR[Number(m[2]) - 1]}` : g; };

/** Saf: HTML mesaj → { simge, baslik, govde: [satır], altbilgi } ya da null (biçim tanınmadı). */
function parcala(metin) {
  const t = String(metin || '');
  const m = /^(\S+)\s+<b>([\s\S]*?)<\/b>\n\n([\s\S]*?)(?:\n\n)?(<i>[^\n]*<\/i>)?\s*$/.exec(t);
  if (!m) return null;
  return { simge: m[1], baslik: m[2], govde: m[3] ? m[3].split('\n').filter(s => s.trim()) : [], altbilgi: m[4] || '' };
}

/** Saf: "Hücum (demo): olay" → { bot, canli, olay } */
function basAyir(baslik) {
  let m = BOT_RE.exec(baslik);
  if (m) return { bot: BA.cevir(m[1]), canli: m[2] === 'GERÇEK PARA', olay: m[3] };
  m = BOT_YALIN_RE.exec(baslik);
  if (m) return { bot: BA.cevir(m[1]), canli: false, olay: m[2] };
  return { bot: null, canli: false, olay: baslik };
}

const yuzdeBul = (satirlar) => { const m = /%\s?(\d+(?:\.\d+)?)/.exec(satirlar.join(' ')); return m ? sayi(m[1]) : null; };
const botSayfa = (bot, alt) => `Botlar › ${bot || 'bot'}${alt ? ' › ' + alt : ''}`;

/**
 * Olay kuralları: [regex, (eşleşme, bağlam) → { b: başlık, g?: gövde satırları (yoksa aynen), n?: ne yapmalı }].
 * Bağlam: { bot, govde, simge }.
 */
const KURALLAR = [
  [/^ACİL DURDURMA$/, (m, c) => ({
    b: c.bot ? `${c.bot} durduruldu` : 'Acil durdurma yapıldı',
    g: c.govde.map(s => s.replace(/^sebep:\s*/i, 'Sebep: ').replace(/^(\d+) emir iptal, (\d+) pozisyon kapatma emri/, '$1 bekleyen emir iptal edildi, $2 pozisyon kapatılıyor')).map(nokta),
    n: `${botSayfa(c.bot, 'Hesap')}'ta pozisyonların kapandığına bak. Yeniden başlatmak için Genel › Başlat.` })],
  [/^felaket stopu konamadı$/, (m, c) => ({ b: 'Koruma stopu konamadı', g: [...c.govde, 'Pozisyon şu an korumasız.'],
    n: `${botSayfa(c.bot, 'Hesap')}'ta pozisyona bak. Bot bir sonraki çalışmada yeniden dener; beklemek istemezsen acil durdur.` })],
  [/^felaket stopu kayboldu$/, (m, c) => ({ b: 'Koruma stopu borsada görünmüyor', n: `${botSayfa(c.bot, 'Hesap')}'ta kontrol et; bot bir sonraki çalışmada yeniden koyar.` })],
  [/^felaket stopu tetiklendi$/, () => ({ b: 'Koruma stopu çalıştı, pozisyon kapandı', n: 'Bir şey yapman gerekmiyor; ayrıntı İşlemler görünümünde.' })],
  [/^felaket stopu güncellenemedi$/, () => ({ b: 'Koruma stopu güncellenemedi', n: 'Bot bir sonraki çalışmada yeniden dener; tekrarlarsa Sistem › Günlükler\'e bak.' })],
  [/^ENGEL — uygulama sapması$/, (m, c) => {
    const y = yuzdeBul(c.govde.slice(0, 1));
    return { b: `${c.bot || 'Bot'} yeni emir vermiyor`,
      g: [`Son 30 günde gerçek sonuç simülasyondan ${y ? '%' + y : 'sınırdan fazla'} saptı (sınır %5). Bot güvenlik için emir vermeyi bıraktı; açık pozisyonlar duruyor.`],
      n: `İleri test › Kairos / Tao'da nedenine bak. Sorun yoksa ${botSayfa(c.bot, 'Yönetim')}'de "Engeli kaldır".` };
  }],
  [/^ENGEL — pozisyon uyuşmazlığı$/, (m, c) => ({ b: `${c.bot || 'Bot'} yeni emir vermiyor: kayıt borsayla uyuşmuyor`,
    n: `${botSayfa(c.bot, 'Yönetim')} › "Borsayla karşılaştır"; farkı giderip "Engeli kaldır".` })],
  [/^bot (\d+) saattir çalışmadı$/, (m, c) => ({ b: `${m[1]} saattir çalışmadı`,
    n: 'Sunucu bilgisayarın açık olduğunu ve Pusula\'nın çalıştığını kontrol et (Ana sayfa › Sistem).' })],
  [/^günlük özet (\d{4}-\d{2}-\d{2})$/, (m, c) => {
    const g = [];
    for (const s of c.govde) {
      let x;
      if ((x = /^Karar: BTC LONG AÇIK/.exec(s))) g.push('Karar: BTC tutuluyor (trend yukarı).');
      else if (/^Karar: BTC POZİSYON YOK/.test(s)) g.push('Karar: BTC yok, USDT\'de bekleniyor (trend aşağı).');
      else if ((x = /^Özsermaye ([\d.]+) USDT/.exec(s))) g.push(`Hesap: ${sayi(x[1])} USDT.`);
      else if ((x = /^BTC payı %(\d+) \(hedef %(\d+)\)/.exec(s))) g.push(`BTC payı %${x[1]} (hedef %${x[2]}).`);
      else if ((x = /^Açık pozisyon: (.+)$/.exec(s))) g.push(`Açık pozisyon: ${x[1] === 'yok' ? 'yok' : x[1].replace(/ LONG/g, '').replace(/ SHORT/g, ' (kısa)')}.`);
      else if ((x = /^Modele göre sapma: ([-\d.]+) puan/.exec(s))) g.push(`Modelden günlük sapma: ${sayi(x[1])} puan.`);
      else if ((x = /^Gölgeye göre 30 g birikimli fark: ([-\d.]+) puan \((\w+)\)/.exec(s))) g.push(`Simülasyondan 30 günlük sapma: ${sayi(x[1])} puan — ${x[2] === 'normal' ? 'normal' : x[2] === 'incele' ? 'incelenmeli' : 'sınırda'}.`);
      else if ((x = /^Kaçırılan gün: (\d+)/.exec(s))) g.push(`Kaçırılan gün: ${x[1]} (yalnız bugünkü hedefe gidildi).`);
      else if ((x = /^Asgari nominal altı \(verilmeyen\) emir: (\d+)/.exec(s))) g.push(`Borsanın en küçük tutarının altında kaldığı için verilmeyen emir: ${x[1]}.`);
      else if (/^(Kol payları|Modele göre sapma: ardışık|Gölge karşılaştırması: kayıt bekleniyor)/.test(s)) continue;
      else g.push(nokta(ondalik(s)));
    }
    return { b: `${gunKisa(m[1])} özeti`, g };
  }],
  [/^işlemler (\d{4}-\d{2}-\d{2})$/, (m, c) => ({ b: `${gunKisa(m[1])} işlemleri`, g: c.govde.map(s => {
    let x;
    if ((x = /^(\S+) (buy|sell) ([\d.]+) @ ([\d.]+)(.*)$/.exec(s))) return `${x[1]} ${x[2] === 'buy' ? 'alış' : 'satış'} ${sayi(x[3])} @ ${sayi(x[4])}${x[5]}`;
    return s.replace(/^Donchian: (\d+) emir/, 'Trend kolu: $1 emir').replace(/^DCA: (\d+) yeni merdiven/, 'Kademeli alım: $1 yeni merdiven').replace(/^DCA kapanan: /, 'Kademeli alımı kapanan: ');
  }) })],
  [/^uygulama sapması İNCELE bandında$/, (m, c) => {
    const y = yuzdeBul(c.govde);
    return { b: 'Simülasyondan sapma büyüyor', g: [`Son 30 günde gerçek sonuç simülasyondan ${y ? '%' + y : '%3\'ten fazla'} saptı (normal %3'e kadar; %5'te bot durur).`],
      n: 'Bot çalışmaya devam ediyor. Bu hafta İleri test › Kairos / Tao\'ya bir bak.' };
  }],
  [/^kaçırılan (\d+) gün — gerçekleşen vs gölge$/, (m, c) => ({ b: `${m[1]} gün kaçırıldı`, g: c.govde.map(ondalik),
    n: 'Bot bugünkü hedefe gitti; kaçırılan günlerin farkı yukarıda. Bir şey yapman gerekmiyor.' })],
  [/^çalışmada hata$/, () => ({ b: 'Günlük çalışmada hata', n: 'Sistem › Günlükler\'de ayrıntıya bak; bot yarın yeniden dener.' })],
  [/^günlük çalışma yapılamadı$/, () => ({ b: 'Günlük çalışma yapılamadı', n: 'Sistem › Günlükler\'de nedenine bak; internet ya da borsa sorunuysa bot bir sonraki denemede çalışır.' })],
  [/^yürütücü DURDURULDU — elle müdahale gerekli$/, (m, c) => ({ b: 'Borsaya emir göndermeyi durdurdu', n: `${botSayfa(c.bot, 'Yönetim')} › "Borsayla karşılaştır"; farkı giderdikten sonra yeniden başlat.` })],
  [/^yürütücü otomatik olarak AKTIF$/, () => ({ b: 'Borsaya emir göndermeye yeniden başladı' })],
  [/^hesap kesicisi uyarısı: başlangıçtan %(.+) kayıp$/, (m, c) => ({ b: `Başlangıçtan %${sayi(m[1])} kayıp`, g: c.govde.map(ondalik), n: `${botSayfa(c.bot)}'a bak; kayıp sınırı aşılırsa bot kendini durdurur.` })],
  [/^hesapta sermaye tavanından fazla para var$/, () => ({ b: 'Hesapta botun tavanından fazla para var', n: 'Botu ayrı bir hesapta çalıştırman önerilir; bot yalnız tavan kadarıyla işlem yapar.' })],
  [/^mutabakat uyuşmazlığı$/, (m, c) => ({ b: 'Bot kaydı ile borsa uyuşmuyor', n: `${botSayfa(c.bot, 'Yönetim')} › "Borsayla karşılaştır".` })],
  [/^açılışta bağlanılamadı$/, () => ({ b: 'Açılışta borsaya bağlanılamadı', n: 'Denemeler sürüyor; interneti ve Binance anahtarını kontrol et.' })],
  [/^bağlantı kuruldu$/, () => ({ b: 'Borsaya bağlandı' })],
  [/^GERÇEK PARA moduna geçildi$/, () => ({ b: 'Canlı hesaba geçildi', n: 'Sen yapmadıysan hemen demo moduna geri dön ve acil durdur.' })],
  [/^GERÇEK PARA emir onayı verildi$/, () => ({ b: 'Canlı hesapta emir onayı verildi', n: 'Sen yapmadıysan hemen acil durdur.' })],
  [/^DUR acil durdurması BAŞARISIZ$/, () => ({ b: 'Acil durdurma başarısız', n: 'Binance arayüzünden pozisyonları elle kapat.' })],
  [/^(para yatırma|para çekme) kaydedildi$/, (m) => ({ b: `${buyuk(m[1])} kaydedildi` })],
  [/^bekçi uyarısı$/, () => ({ b: 'Bekçi uyarısı', n: 'Sistem › Günlükler\'de ayrıntıya bak.' })],
  [/^(.+) ileri veri: (DUR|uyarı)$/, (m) => ({ b: `${m[1]} · İleri test ${m[2] === 'DUR' ? 'durdurma sinyali' : 'uyarısı'}`, n: 'İleri test sayfasında ayrıntıya bak.' })],
  // Motor (lib/engine.js, server.js) — kâğıt test motoru ve sunucu
  [/^KILL-SWITCH DEVREDE$/, () => ({ b: 'Kâğıt test acil freni devrede', n: 'Arşiv › Kâğıt test riski\'nde nedenine bak.' })],
  [/^GÜNLÜK ZARAR LİMİTİ$/, () => ({ b: 'Kâğıt test: günlük zarar sınırı aşıldı', n: 'Kâğıt botlar bugün işlem açmaz; bir şey yapman gerekmiyor.' })],
  [/^Motor Başlatılamadı$/, () => ({ b: 'Pusula başlatılamadı', n: 'Sistem › Günlükler\'e bak ve Pusula\'yı yeniden başlat.' })],
  [/^Bot Sunucusu Başlatıldı$/, () => ({ b: 'Pusula başladı' })],
  [/^Bot Çöktü — Yeniden Başlatılıyor$/, () => ({ b: 'Pusula beklenmedik şekilde kapandı, yeniden başlıyor', n: 'Bir şey yapman gerekmiyor; tekrarlarsa Sistem › Günlükler\'e bak.' })],
  [/^Yakalanmamış Promise Hatası$/, () => ({ b: 'Beklenmeyen bir hata oluştu', n: 'Sistem › Günlükler\'e bak; tekrarlıyorsa bildir.' })],
  [/^Piyasa Verisi Alınamıyor$/, () => ({ b: 'Borsadan fiyat gelmiyor', n: 'İnterneti kontrol et. Veri geri gelince ayrıca haber verilir.' })],
  [/^Piyasa Verisi Geri Geldi$/, () => ({ b: 'Borsadan fiyat yeniden geliyor' })],
  // Güncelleme (lib/guncelleme.js)
  [/^Pusula (\S+) kurulmayı bekliyor \(onay\)$/, (m) => ({ b: `Pusula ${m[1]} onayını bekliyor`,
    g: ['Bu sürüm botların çalışmasını etkileyen dosyaları değiştiriyor; bu yüzden kendiliğinden kurulmadı.'], n: 'Uygun bir zamanda Ayarlar › Güncelleme › "Güncellemeyi kur".' })],
  [/^Pusula (\S+) kurulamadı — geri alındı$/, (m) => ({ b: `Pusula ${m[1]} kurulamadı, eski sürüme dönüldü`, n: 'Bir şey yapman gerekmiyor; nedeni Ayarlar › Güncelleme\'de.' })],
  [/^Pusula güncellemesi: elle bakılmalı$/, () => ({ b: 'Güncelleme kendiliğinden kurulamadı', n: 'Ayarlar › Güncelleme\'deki açıklamaya bak.' })],
  [/^Pusula güncellemesi: GitHub'a ulaşılamıyor$/, () => ({ b: 'Güncellemeler denetlenemiyor', n: 'İnterneti kontrol et; sorun sürmüyorsa bir şey yapman gerekmiyor.' })],
  // Sunucu (server.js) ve diğerleri
  [/^Telefondan acil durdurma kilitlendi$/, () => ({ b: 'Telefondan acil durdurma kilitlendi (çok sayıda yanlış PIN)', n: 'Sen değilsen PIN\'ini değiştir (npm run acil-pin). Kilit masaüstünden açılır.' })],
  [/^Sunucunun internetinin dış IP adresi değişti$/, () => ({ b: 'Sunucunun internet adresi değişti', n: 'Binance anahtarında IP kısıtı varsa yeni adresi ekle.' })],
  [/^Ayar dosyası bozuk açıldı$/, () => ({ b: 'Ayar dosyası bozuktu, son iyi kopya kullanıldı', n: 'Son ayar değişikliğini Ayarlar\'da kontrol et.' })],
  [/^Disk dolmak üzere$/, () => ({ b: 'Disk dolmak üzere', n: 'Gereksiz dosyaları sil; disk dolarsa bot kayıt yazamaz.' })],
  [/^Dikkat listesi (\d{4}-\d{2}-\d{2}): (\d+) yeni coin$/, (m) => ({ b: `Kaçın listesine ${m[2]} coin girdi`, n: 'Ayrıntı: Coin tarama › Kaçın.' })],
  [/^(.+) — (\d{4}-\d{2}-\d{2}) alım-satım \(kâğıt hesap\)$/, (m) => ({ b: `${m[1]} · alım-satım listesi (kâğıt hesap)`,
    n: 'Gerçek hesabın için emirleri Midas\'a gir, sonra Portföy › Modeller › Bu ay › "Uyguladım".' })],
];

/**
 * Saf: Telegram HTML mesajını sade biçime çevirir. Tanınmayan biçim (rapor, deneme, komut yanıtı) aynen döner.
 * @param {string} metin @param {{ simdi?: Date }} o
 */
function bicimle(metin, o = {}) {
  const p = parcala(metin);
  if (!p || /^📋/.test(p.simge) || /Test Bildirimi/.test(p.baslik)) return metin;
  const bas = basAyir(p.baslik);
  // Gövde: iç belge adı silinir; sürüm numarası geçmeyen satırlarda ondalıklar Türkçe (4999.29 USDT → 4.999,29 USDT).
  const govde = p.govde.map(belgesiz).filter(Boolean);
  // Kuralın yeniden yazmadığı gövde: sürüm geçmeyen satırlarda ondalıklar Türkçe (4999.29 USDT → 4.999,29 USDT).
  const turkce = (l) => l.map(s => (/sürüm|v\d/i.test(s) ? s : ondalik(s)));
  let sonuc = null;
  for (const [r, f] of KURALLAR) {
    const m = r.exec(bas.olay);
    if (m) { try { sonuc = f(m, { bot: bas.bot, govde, simge: p.simge }); } catch (e) { sonuc = null; } break; }
  }
  const botAd = bas.bot ? `${bas.bot}${bas.canli ? ' (canlı)' : ''}` : null;
  const baslik = sonuc && sonuc.b ? sonuc.b : buyuk(bas.olay);
  const ust = botAd && !(sonuc && sonuc.b && sonuc.b.startsWith(bas.bot)) ? `${botAd} · ${baslik}` : (bas.canli && sonuc && sonuc.b ? sonuc.b.replace(bas.bot, botAd) : baslik);
  const g = (sonuc && sonuc.g ? sonuc.g : turkce(govde)).map(s => String(s)).filter(s => s.trim());
  const satirlar = [`${p.simge} <b>${ust}</b>`, ...g];
  if (sonuc && sonuc.n) satirlar.push(`<b>Ne yapmalı:</b> ${sonuc.n}`);
  satirlar.push(`<i>Pusula · ${kisaZaman(o.simdi || new Date())}</i>`);
  return satirlar.join('\n');
}

module.exports = { bicimle, parcala, basAyir, sayi, ondalik, belgesiz, kisaZaman, KURALLAR };
