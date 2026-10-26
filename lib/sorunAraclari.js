/**
 * SORUN ARAÇLARI (73.8, Sorun merkezi P3) — bugün hiçbir düğmenin çözemediği durumlar için KULLANICI araçları.
 * Kullanıcı kararı (2026-10-24, taslak 4U955wGXbnq8exaMCh6hBk; bellek uc-ekran-kararlari.md): araçlar telefondan da kullanılır —
 * acil PIN + onay metni. Her araç önce ÖNİZLEME döndürür (ne değişecek); uygulama PIN + onay + önizlemenin parmak izi ister —
 * arada durum değiştiyse 409 ve yeni önizleme. Hiçbir araç EMİR GÖNDERMEZ; yalnız botun kaydı / engel / risk durumu değişir.
 *
 *   kayit-esitle           Y-03, Y-33  felaket stopu / ADL / likidasyon sonrası tek coinin Donchian + DCA sanal kaydını borsadaki nete
 *                                      çeker (kalkanBot.kayitEsitle — acilDurdur'daki kol sıfırlamasının tek sembollü, emirsiz hâli).
 *   zarar-siniri-sifirla   Y-04        K3 mandalı: lib/risk/durum.js killSifirla (yeni tepe = bugünkü değer).
 *   sapma-kabul            Y-05        %5 uygulama sapması ENGEL'i: penceredeki aralıklar "kabul" işaretlenir (silinmez), banda sayılmaz.
 *   yatirma-kabul          Y-44        spot yatırma / çoklu varlık yabancı bakiye kabulü (Engeli kaldır'dan ayrı — engel ve fren kalkmaz).
 *   para-akisi-onay        (2026-10-25) borsada algılanan, onay bekleyen para giriş / çıkışlarını onaylar (lib/live/paraAkisi.js):
 *                                      tabanlar + tavan yeni bakiyeye; onaysız çıkış durdurması kalkar.
 *   para-akisi-reddet      (76.4) "Bu ben değilim": onay bekleyen ÇIKIŞI "reddedildi — güvenlik" işaretler; bot durmuş KALIR,
 *                                      hareket hesaplara katılmaz, Telegram güvenlik alarmı. Onay metni BEN DEĞİLİM (sadeleşmiş: BEN DEGILIM).
 *   guvenli-kip-kaldir     (77.x, kullanıcı 2026-10-26: "sunucuya ulaşamama durumunda tek imkanımız telefon") 69.1 öz denetim ya da
 *                                      74.3 veri kalitesi GÜVENLİ KİPİNDEN çıkış (BindirmeBot.guvenliKipKaldir — masaüstü "Güvenli kipi
 *                                      kaldır" ile AYNI etki) + öz denetim sayaçları "onay" (ozDenetim.onayVerildi). Onay metni KALDIR.
 *                                      RİSKİ ARTIRAN yön: bot sonraki çalışmada yeniden işlem açabilir — Telegram'a UYARI (bildirim merkezi
 *                                      'güvenlik' sınıfına koyar: sessiz saatte de gider).
 *   guvenli-kip-gir        (77.x) botu elle güvenli kipe alır (kaynak 'elle'; yeni işlem yok, stop / koruma sürer, kendiliğinden
 *                                      KALKMAZ). Güvenli yön. Onay metni GÜVENLİ (sadeleşmiş: GUVENLI).
 *   borsa-karsilastir      (77.x, kullanıcı onayı 2026-10-26 — envanter #13) "Borsayla karşılaştır" (masaüstü mutabakat ucuyla AYNI yol:
 *                                      bağlan → yürütücü mutabakatı → bot mutabakatı; nöbet kapısı). Emir AÇMAZ ama YAZAN yan etkileri var
 *                                      (sahipsiz önekli kademeli alım emri İPTALİ, dolum işleme, merdiven yeniden kuyruğu, kol engeli koy/kaldır)
 *                                      — telefonda kapatılamaz (lib/live değişmez), bu yüzden önizlemede AÇIKÇA yazılır. Onay KARŞILAŞTIR.
 *                                      Kullanıcı müdahalesi sayılmaz (prova günlüğüne yazılmaz).
 *   yeniden-baslat         (77.x, envanter #10) botsuz araç: mevcut yeniden başlatma yolu (temiz kapanış, kod 75 → denetleyici ~10 sn
 *                                      sonra açar; PowerShell / cmd YOK). TR 02:30–04:30 dışında, saatte en çok 1 (kalıcı kayıt), süren
 *                                      bot çalışması yokken, yalnız denetleyiciyle başlatılmışsa. Onay YENİDEN BAŞLAT. Telegram bilgi.
 *   Bu ikisi YALNIZ TELEFON kademesinde (geliştirme bilgisayarından iletilmez — lib/acilPin.js SORUN_ARAC_GELISTIRME_YOLU).
 *   Güvenli kip araçları bot karar koduna (lib/live/*) DOKUNMAZ: önizleme / uygulama bu dosyada ("yerel araç"), botun mevcut guvenliKipKoy /
 *   guvenliKipKaldir yöntemleri çağrılır; ayar geçmişine 'bot' türünde (geri alınamaz) satır yazılır.
 *
 * Saf açıklayıcılar (Sorunlar kartı "Neyi saydı?"): uyusmazlikAciklama (Y-09b), frenDokumu (Y-14).
 * Kairos demo kabul süresince (2026-12-09) de çalışır (kullanıcı eylemi) ama prova günlüğüne ölçümden düşülecek müdahale yazılır
 * (BindirmeBot.kullaniciMudahalesi). Uç kayıtları server.js'te: GET /api/sorun-arac/:arac/onizle · POST /api/sorun-arac/:arac/uygula.
 */
'use strict';
const crypto = require('crypto');
const I = require('./live/isletim');
const { trSaat } = require('./sorunlar');

const DK = 60000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;

const ARACLAR = {
  'kayit-esitle': { ad: 'Kaydı borsaya eşitle', onay: 'ESITLE', sembol: true },
  'zarar-siniri-sifirla': { ad: 'Zarar sınırını sıfırla', onay: 'SIFIRLA' },
  'sapma-kabul': { ad: 'Farkı kabul et', onay: 'KABUL' },
  'yatirma-kabul': { ad: 'Yatırmayı kabul et', onay: 'KABUL' },
  'para-akisi-onay': { ad: 'Para hareketini onayla', onay: 'ONAY' },   // kullanıcı kuralı 2026-10-25 (lib/live/paraAkisi.js)
  'para-akisi-reddet': { ad: 'Bu ben değilim — reddet', onay: 'BEN DEGILIM', onayGoster: 'BEN DEĞİLİM' },   // 76.4 (kullanıcı onayı)
  'guvenli-kip-kaldir': { ad: 'Güvenli kipten çık', onay: 'KALDIR', yerel: true, riskArtirir: true },   // 77.x (kullanıcı 2026-10-26)
  'guvenli-kip-gir': { ad: 'Güvenli kipe al', onay: 'GUVENLI', onayGoster: 'GÜVENLİ', yerel: true },
  // 77.x (kullanıcı onayı 2026-10-26, envanter #13 / #10) — yalnız telefon
  'borsa-karsilastir': { ad: 'Borsayla karşılaştır', onay: 'KARSILASTIR', onayGoster: 'KARŞILAŞTIR', mudahaleDegil: true, yalnizTelefon: true },
  'yeniden-baslat': { ad: 'Pusula\'yı yeniden başlat', onay: 'YENIDEN BASLAT', onayGoster: 'YENİDEN BAŞLAT', botsuz: true, yalnizTelefon: true },
};
const KOL_AD = { kn: 'trend kolu', kd: 'kademeli alım', bt: 'BTC ayağı' };

// ── yardımcılar ──
const sy = (x) => (Number.isFinite(+x) ? String(+(+x).toFixed(8)) : '—');
const coin = (s) => String(s || '').split('/')[0];
/** Onay metni: büyük harf, Türkçe harfler sadeleşir ("eşitle" = "ESITLE"). */
const onayNormal = (s) => String(s == null ? '' : s).trim().toLocaleUpperCase('tr-TR')
  .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/\s+/g, ' ');
/** Durumun parmak izi (önizleme ↔ uygulama arasında değişti mi). Sıra sabit JSON. */
function parmak(durum) {
  const sirala = (v) => (Array.isArray(v) ? v.map(sirala) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sirala(v[k])])) : v);
  return crypto.createHash('sha256').update(JSON.stringify(sirala(durum == null ? null : durum))).digest('hex').slice(0, 16);
}
/** "HYPE", "HYPEUSDT", "HYPE/USDT:USDT" → aynı coin mi. */
function sembolEs(tam, giris) {
  if (!tam || !giris) return false;
  const t = coin(tam).toUpperCase();
  const g = String(giris).toUpperCase().split(/[/:]/)[0];
  return t === g || (g.length > 4 && g.endsWith('USDT') && t === g.slice(0, -4));
}
const redOnizleme = (neden, ek = {}) => ({ uygulanabilir: false, neden, satirlar: [], uyarilar: [], durum: { red: neden }, ...ek });

// ── 1. KAYIT EŞİTLEME (Y-03, Y-33) ──
/**
 * Saf plan. fark = kalkanBot.pozisyonMutabakati() satırı { symbol, borsa, don, dca, ek?, fark } (fark yoksa null).
 * Kurallar (kayıt UYDURMAZ): borsadaki kol neti 0 → iki kol da 0 (stop / ADL tam kapattı); yalnız trend kolu açık ve borsa aynı yönde
 * küçüldüyse → trend kolu borsaya çekilir (kısmi ADL / kısmi stop). Borsada botun bilmediği pozisyon (elle işlem), büyüyen pozisyon,
 * iki kol birden kısmen açık, sonucu belirsiz ya da son 5 dakikadaki emir → uygulanmaz (neden yazılır).
 */
function esitlePlani({ fark, tol = 1e-9, emirler = [], simdi = Date.now() }) {
  if (!fark) return { uygulanabilir: false, neden: 'Bu coinde borsa ile bot kaydı arasında fark yok — eşitlenecek bir şey yok.' };
  const borsa = +fark.borsa || 0, don = +fark.don || 0, dca = +fark.dca || 0, ek = +fark.ek || 0;
  const hedef = borsa - ek;
  const sifir = (x) => Math.abs(x) <= tol;
  const belirsiz = emirler.filter(e => e.durum === 'GONDERILIYOR' || e.durum === 'BILINMIYOR');
  if (belirsiz.length) return { uygulanabilir: false, neden: `Bu coinde sonucu belirsiz ${belirsiz.length} emir var — 5 dakika bekleyip "Borsayla karşılaştır" deyin; fark sürerse yeniden deneyin.` };
  const yeni = emirler.filter(e => Number.isFinite(e.olusturma) && simdi - e.olusturma < 5 * DK);
  if (yeni.length) return { uygulanabilir: false, neden: 'Son 5 dakikada bu coinde emir verildi — gecikmeli dolum olabilir: 2 dakika bekleyip "Borsayla karşılaştır" deyin.' };
  if (sifir(hedef)) {
    if (sifir(don) && sifir(dca)) return { uygulanabilir: false, neden: 'Fark yalnız BTC ayağında — bu araç trend kolu / kademeli alım kaydını eşitler; "Sohbete gönder".' };
    return { uygulanabilir: true, plan: { symbol: fark.symbol, donEk: sifir(don) ? 0 : +(-don).toFixed(12), dcaSifirla: !sifir(dca), donYeni: 0, dcaYeni: 0 }, tur: 'kapandi' };
  }
  if (sifir(don) && sifir(dca)) return { uygulanabilir: false, neden: 'Borsada botun bilmediği bir pozisyon var (elle işlem?). Bu araç kayıt uydurmaz: Binance\'te o işlemi geri alın, sonra "Borsayla karşılaştır".' };
  if (sifir(dca) && Math.sign(hedef) === Math.sign(don) && Math.abs(hedef) < Math.abs(don)) {
    return { uygulanabilir: true, plan: { symbol: fark.symbol, donEk: +(hedef - don).toFixed(12), dcaSifirla: false, donYeni: hedef, dcaYeni: 0 }, tur: 'kismi' };
  }
  return { uygulanabilir: false, neden: Math.abs(hedef) > Math.abs(don + dca)
    ? 'Borsadaki pozisyon botun kaydından BÜYÜK (elle işlem ya da gecikmeli dolum) — bu araç kayıt uydurmaz. Elle işlemi geri alın ya da 2 dk sonra "Borsayla karşılaştır".'
    : 'Kısmi fark iki kol arasında güvenle paylaştırılamıyor (trend kolu ve kademeli alım birlikte açık). Acil durdurmayı düşünün ya da "Sohbete gönder".' };
}

/** Önizleme (bot verisinden). */
function esitleOnizleme({ sembol, fark, tol, emirler = [], dcaAcik = 0, kolEngel = null, simdi = Date.now() }) {
  const p = esitlePlani({ fark, tol, emirler, simdi });
  const durum = { fark: fark ? { s: fark.symbol, b: +fark.borsa || 0, d: +fark.don || 0, c: +fark.dca || 0, e: +fark.ek || 0 } : null, emir: emirler.slice(0, 5).map(e => `${e.id}:${e.durum}:${e.dolan}`), dcaAcik };
  const c = fark ? coin(fark.symbol) : String(sembol || '').toUpperCase();
  const tablo = fark ? { basliklar: ['', 'Borsada', 'Trend kolu kaydı', 'Kademeli alım kaydı', ...(fark.ek ? ['BTC ayağı'] : []), 'Fark'],
    satirlar: [['Şimdi', sy(fark.borsa), sy(fark.don), sy(fark.dca), ...(fark.ek ? [sy(fark.ek)] : []), sy(fark.fark)],
      ...(p.uygulanabilir ? [['Eşitlemeden sonra', sy(fark.borsa), sy(p.plan.donYeni), sy(p.plan.dcaYeni), ...(fark.ek ? [sy(fark.ek)] : []), '0']] : [])] } : null;
  const satirlar = [];
  if (p.uygulanabilir) {
    satirlar.push(p.tur === 'kapandi' ? `${c}: pozisyon borsada kapanmış (stop / ADL / likidasyon) ama bot açık sanıyor — kayıt 0'a çekilir.` : `${c}: pozisyon borsada küçülmüş (kısmi ADL / kısmi stop) — trend kolu kaydı borsadaki miktara çekilir.`);
    if (p.plan.donEk) satirlar.push(`Trend kolu (Donchian) düzeltmesi: ${p.plan.donEk > 0 ? '+' : ''}${sy(p.plan.donEk)}`);
    if (p.plan.dcaSifirla) satirlar.push('Kademeli alım (DCA) deal\'i kapanmış sayılır; coinin DCA kaydı silinir.');
    satirlar.push('Borsaya emir GÖNDERİLMEZ — yalnız botun kaydı değişir.');
    if (kolEngel) satirlar.push('Kol engeli hemen kalkmaz: eşitlemeden sonra "Borsayla karşılaştır" temiz çıkınca kalkar.');
  }
  const uyarilar = [];
  if (p.uygulanabilir && dcaAcik > 0) uyarilar.push(`Borsada bu coinde botun ${dcaAcik} açık kademeli alım emri var. Eşitlemeden sonraki "Borsayla karşılaştır" bunları sahipsiz sayıp İPTAL eder (yeni pozisyon açmaz).`);
  const son = emirler.slice(0, 3).map(e => `${Number.isFinite(e.olusturma) ? trSaat(e.olusturma, simdi) : '—'} · ${KOL_AD[e.bot] || e.bot} · ${e.side === 'sell' ? 'satış' : 'alış'} ${sy(e.amount)} (dolan ${sy(e.dolan)}, ${e.durum})`);
  if (son.length) satirlar.push(`Bu coindeki son emirler: ${son.join(' | ')}`);
  return { uygulanabilir: !!p.uygulanabilir, neden: p.neden || null, baslik: `${c}: kaydı borsaya eşitle`, satirlar, uyarilar, tablo, plan: p.plan || null, durum,
    sonraki: p.uygulanabilir ? 'Uyguladıktan sonra "Borsayla karşılaştır".' : null };
}

// ── 2. K3 ZARAR SINIRI (Y-04) ──
function k3Onizleme(rd) {
  const d = rd || {};
  const kill = +d.kill || 0;
  const durum = { kill, killZamani: d.killZamani || null, hwm: d.hwm || null, ozsermaye: d.ozsermaye || null };
  if (!(kill > 0)) return redOnizleme('Zarar sınırı (kill mandalı) çekili değil — sıfırlanacak bir şey yok.', { durum });
  const yeniTepe = d.ozsermaye || d.hwm;
  const dus = d.hwm > 0 && d.ozsermaye > 0 ? (1 - d.ozsermaye / d.hwm) * 100 : null;
  return {
    uygulanabilir: true, neden: null, baslik: `Zarar sınırı (K${kill}) çekili`, durum,
    satirlar: [`Mandal: K${kill}${d.killNedeni ? ` — ${String(d.killNedeni).slice(0, 200)}` : ''}${d.killZamani ? ` (${trSaat(+d.killZamani)})` : ''}`,
      `Tepe özsermaye ${sy(d.hwm)} USDT · son kayıtlı ${sy(d.ozsermaye)} USDT${dus != null ? ` · tepeden düşüş %${dus.toFixed(1).replace('.', ',')}` : ''}`,
      `Sıfırlanırsa: mandal 0, yeni tepe = bugünkü değer (${sy(yeniTepe)} USDT). Bot bir sonraki günlük çalışmada yeniden risk alır.`],
    uyarilar: ['Bu bir strateji kararıdır; sıfırlarsanız bot yeniden risk alır.'],
    plan: { yeniTepe }, sonraki: 'Sıfırlama bir sonraki günlük çalışmada etkili olur.',
  };
}

// ── 3. UYGULAMA SAPMASI KABULÜ (Y-05) ──
/** Saf döküm: bandın hangi aralıklardan geldiği (kabul edilenler işaretli). */
function sapmaDokumu(farklar, bugun) {
  const l = farklar || [];
  const son = bugun || (l.length ? l[l.length - 1].bit : null);
  const pencere = son ? l.filter(f => I.gunFarki(f.bit, son) < 30) : [];
  const oz = I.uygulamaOzeti(l, bugun, { kabulHaric: true });
  const pct = (x) => (Number.isFinite(+x) ? `${(x * 100).toFixed(2).replace('.', ',')}` : '—');
  const toplamMutlak = pencere.filter(f => !f.kabul).reduce((a, f) => a + Math.abs(+f.fark || 0), 0);
  const satirlar = pencere.map(f => [`${f.bas} → ${f.bit}`, String(f.gun || ''), pct(f.gercek), pct(f.golge), pct(f.fark),
    f.kabul ? 'kabul edildi' : f.telafi ? 'kaçırılan gün (telafi)' : '']);
  const enBuyuk = pencere.filter(f => !f.kabul).sort((a, b) => Math.abs(b.fark) - Math.abs(a.fark))[0] || null;
  return { oz, pencere, tablo: { basliklar: ['Aralık', 'Gün', 'Gerçek %', 'Gölge %', 'Fark (puan)', 'Not'], satirlar },
    enBuyuk: enBuyuk && toplamMutlak > 0 ? { aralik: `${enBuyuk.bas} → ${enBuyuk.bit}`, pay: Math.abs(enBuyuk.fark) / toplamMutlak, telafi: !!enBuyuk.telafi } : null };
}
function sapmaOnizleme(farklar, engel, bugun) {
  const d = sapmaDokumu(farklar, bugun);
  const acik = d.pencere.filter(f => !f.kabul);
  const engelSapma = !!(engel && /^uygulama sapması/.test(engel));
  const durum = { engel: engelSapma ? engel : null, acik: acik.map(f => `${f.bas}|${f.bit}|${f.fark}`) };
  const pct = (x) => `%${(Math.abs(x) * 100).toFixed(2).replace('.', ',')}`;
  const satirlar = [`Son 30 günde birikimli |gerçek − gölge| ${pct(d.oz.birikim)} (bant: ${d.oz.bant}; eşikler %3 incele, %5 ENGEL)${d.oz.kabulEdilen ? ` · ${d.oz.kabulEdilen} aralık daha önce kabul edildi` : ''}`];
  if (d.enBuyuk) satirlar.push(`Farkın %${Math.round(d.enBuyuk.pay * 100)}'i tek aralıktan: ${d.enBuyuk.aralik}${d.enBuyuk.telafi ? ' (kaçırılan gün — telafi)' : ''}.${d.enBuyuk.pay >= 0.5 ? ' Tek güne yığılmış: genellikle kabul edilebilir.' : ' Her güne yayılmış küçük fark varsa (kayma / funding) geliştirme sohbetine de yazın.'}`);
  if (!acik.length) return { ...redOnizleme('Penceredeki bütün aralıklar zaten kabul edilmiş ya da kayıt yok.', { durum }), satirlar, tablo: d.tablo, baslik: 'Uygulama sapması' };
  if (!engelSapma && d.oz.bant !== 'engel' && d.oz.bant !== 'incele') return { ...redOnizleme('Uygulama sapması bandı normal — kabul edilecek fark yok.', { durum }), satirlar, tablo: d.tablo, baslik: 'Uygulama sapması' };
  satirlar.push(`Kabul edilirse: ${acik.length} aralık "kabul edildi" işaretlenir (kayıt SİLİNMEZ), %5 bandına sayılmaz${engelSapma ? '; ENGEL kalkar ve aynı farkla yeniden gelmez' : ''}. Yeni günlerin farkı yine izlenir.`);
  return { uygulanabilir: true, neden: null, baslik: 'Uygulama sapması: farkı kabul et', satirlar, uyarilar: ['Demo kabul ölçümü (U1/U2) değişmez — ham fark raporda kalır.'], tablo: d.tablo, durum,
    plan: { aralik: acik.length }, sonraki: engelSapma ? 'Bot bir sonraki çalışmada yeniden işlem yapar.' : null };
}

// ── 4. YATIRMA KABULÜ (Y-44, Y-43) ──
function yatirmaOnizleme(bek, cvEngel, cokluVar) {
  const tutar = bek && bek.tutar > 0 ? bek.tutar : 0;
  const yabanci = !!(cvEngel && /botun olmayan bakiye/.test(cvEngel));
  const durum = { tutar, notlar: (bek && bek.notlar) || [], yabanci };
  if (!tutar && !yabanci) return redOnizleme('Kabul bekleyen yatırma yok.', { durum });
  const satirlar = [];
  if (tutar) satirlar.push(`Spot cüzdana yatırılan ≈ ${tutar.toFixed(2)} USDT (${((bek && bek.notlar) || []).slice(-3).join(', ') || 'not yok'}) kabul edilir: ölçüm tabanları ve sermaye tavanı güncellenir.`);
  if (yabanci) satirlar.push(`Çoklu varlık: "${String(cvEngel).slice(0, 160)}" — spottaki bakiye botun sayılır, vadeli BTC tabanı yeniden okunur.`);
  else if (cokluVar) satirlar.push('Çoklu varlık: spot bakiye ve vadeli BTC tabanı yeniden okunur.');
  satirlar.push('Engel, emir freni ve sapma bandı DEĞİŞMEZ (onlar için kendi kartları).');
  return { uygulanabilir: true, neden: null, baslik: 'Yatırmayı kabul et', satirlar, uyarilar: ['Yalnız para SİZİN yatırmanızsa kabul edin; değilse Binance hesabınızı kontrol edin.'], durum,
    plan: { tutar }, sonraki: yabanci ? 'Sonra "Borsayla karşılaştır".' : null };
}

// ── 5. GÜVENLİ KİP (69.1 öz denetim · 74.3 veri kalitesi · elle) ──
/** Güvenli kipi kim koydu, kendiliğinden kalkar mı (kaynak → metin). */
function gkKaynak(k) {
  const s = String(k || '');
  if (s === 'oz:bakim') return { ad: 'öz denetim — Binance bakımı', kendi: 'bakım bitince 15 dk sonra kendiliğinden kalkar' };
  if (s === 'oz:fiyat') return { ad: 'öz denetim — fiyat kaynakları birbirini tutmuyor', kendi: 'fiyat farkı %1\'in altına inince kendiliğinden kalkar' };
  if (s === 'oz:stopVurus') return { ad: 'öz denetim — 24 saatte 2 felaket stopu', kendi: 'son stop vuruşundan 24 saat sonra kendiliğinden kalkar' };
  if (s === 'oz:tekrar') return { ad: 'öz denetim — aynı hata tekrar ediyor', kendi: '60 dakika aynı hata gelmezse kendiliğinden kalkar' };
  if (/^oz:/.test(s)) return { ad: `öz denetim (${s.slice(3)})`, kendi: 'sebep geçince öz denetim kaldırır' };
  if (s === 'veri') return { ad: 'veri kalitesi (74.3, etkin kip)', kendi: 'bot 15 dakikada bir yeniden denetler; veri temizlenince kendiliğinden kalkar' };
  if (s === 'elle') return { ad: 'elle (siz — "Güvenli kipe al")', kendi: null };
  return { ad: s || 'bilinmiyor', kendi: null };
}
/** Saf: güvenli kipten çıkış önizlemesi. d = { guvenliKip, engel, paraDurdurma } (bot.durum alanları). */
function gkKaldirOnizleme(d = {}, simdi = Date.now()) {
  const g = d.guvenliKip || null;
  const durum = { gk: g ? { k: g.kaynak || null, z: g.zaman || null, m: g.metin || null } : null, engel: !!d.engel, pd: !!d.paraDurdurma };
  if (!g) return redOnizleme('Bot güvenli kipte değil — kaldırılacak bir şey yok.', { durum, baslik: 'Güvenli kip' });
  const kk = gkKaynak(g.kaynak);
  const satirlar = [`Neden güvenli kipte: ${String(g.metin || '—').slice(0, 300)}${Number.isFinite(+g.zaman) && +g.zaman > 0 ? ` (${trSaat(+g.zaman, simdi)}'den beri)` : ''}`,
    `Kim koydu: ${kk.ad}${kk.kendi ? ` — normalde ${kk.kendi}` : ' — kendiliğinden KALKMAZ'}.`,
    'Şu an: yeni işlem açılmıyor; açık pozisyonların felaket stopu borsada, dakikalık koruma çalışıyor.',
    'Çıkınca: ertelenen günlük çalışma birkaç dakika içinde yapılır ve bot yeniden YENİ İŞLEM AÇABİLİR. Öz denetimin tekrar sayaçları bu andan sonrasını sayar.',
    'Borsaya emir GÖNDERİLMEZ — yalnız botun güvenli kip işareti kalkar.'];
  if (d.engel) satirlar.push(`ENGEL sürüyor (${String(d.engel).slice(0, 160)}) — güvenli kip kalksa da bot yeni işlem AÇMAZ; ENGEL yalnız sunucudaki panelden kalkar.`);
  if (d.paraDurdurma) satirlar.push('Onaysız para çıkışı durdurması sürüyor — yalnız azaltan emir kipi onunla kalır (Para hareketini onayla / Bu ben değilim kartı).');
  const uyarilar = ['Riski artıran yön: sebep gerçekten geçmediyse bot bozuk koşulda işlem açabilir.'];
  if (/^oz:/.test(String(g.kaynak || '')) || g.kaynak === 'veri') uyarilar.push(`Sebep sürüyorsa bot kısa süre içinde yeniden güvenli kipe girer (${g.kaynak === 'veri' ? 'bir sonraki günlük çalışmanın veri denetimi' : 'öz denetimin bir sonraki yoklaması'}). Kendiliğinden geçen durumlarda (bakım, fiyat farkı) beklemek daha doğrudur.`);
  return { uygulanabilir: true, neden: null, baslik: 'Güvenli kipten çık', satirlar, uyarilar, durum, plan: { kaynak: g.kaynak || null },
    sonraki: d.engel ? 'ENGEL sürdüğü için bot yine işlem açmaz.' : 'Bot sonraki çalışmada yeniden işlem açabilir; Telegram\'a güvenlik iletisi gider (sessiz saatte de).' };
}
/** Saf: elle güvenli kipe alma önizlemesi. */
function gkGirOnizleme(d = {}, simdi = Date.now()) {
  const g = d.guvenliKip || null;
  const durum = { gk: g ? { k: g.kaynak || null, z: g.zaman || null } : null, engel: !!d.engel };
  if (g) return redOnizleme(`Bot zaten güvenli kipte (${gkKaynak(g.kaynak).ad}${Number.isFinite(+g.zaman) && +g.zaman > 0 ? `, ${trSaat(+g.zaman, simdi)}'den beri` : ''}).`, { durum, baslik: 'Güvenli kipe al' });
  if (d.engel) return redOnizleme(`Bot zaten ENGELLİ (tam kapanma: ${String(d.engel).slice(0, 160)}) — güvenli kip gerekmez, yeni işlem zaten açılmıyor.`, { durum, baslik: 'Güvenli kipe al' });
  return { uygulanabilir: true, neden: null, baslik: 'Botu güvenli kipe al', durum, plan: {},
    satirlar: ['Günlük çalışma ertelenir: bot YENİ İŞLEM AÇMAZ (yürütücü yalnız azaltan emre izin verir).',
      'Açık pozisyonlar KAPANMAZ; felaket stopları borsada kalır, dakikalık koruma / marj denetimi sürer.',
      'Kendiliğinden KALKMAZ: "Güvenli kipten çık" (acil PIN + KALDIR) — telefondan da.',
      'Borsaya emir GÖNDERİLMEZ.'],
    uyarilar: ['Pozisyonları hemen kapatmak gerekiyorsa bu araç değil "Acil durdur" (PIN + DURDUR).'],
    sonraki: 'Telegram\'a bilgi gider; kaldırmak için "Güvenli kipten çık".' };
}

// ── 6. BORSAYLA KARŞILAŞTIR (telefon) ──
/** Saf: d = { kolEngel, engel, nobet (metin|null), suruyor (bool) }. */
function karsilastirOnizleme(d = {}) {
  const durum = { kolEngel: d.kolEngel || null, engel: d.engel || null };
  const baslik = 'Borsayla karşılaştır';
  if (d.nobet) return redOnizleme(`Bu bot bu makinede işlem göremez (nöbet / taşıma / devralma kapısı): ${String(d.nobet).slice(0, 200)}`, { durum, baslik });
  if (d.suruyor) return redOnizleme('Botun bir çalışması sürüyor — bitince (birkaç dakika) yeniden deneyin.', { durum, baslik });
  const satirlar = [`Şu an: ${d.kolEngel ? `kol engeli var (${String(d.kolEngel).slice(0, 160)})` : 'kol engeli yok'}${d.engel ? ` · ENGEL: ${String(d.engel).slice(0, 120)} (bu araç ENGEL'i kaldırmaz)` : ''}.`,
    'Yapılan: borsadaki açık emirler ve pozisyonlar okunur, botun kaydıyla karşılaştırılır. YENİ EMİR AÇILMAZ.',
    'Yazan yan etkiler (telefonda kapatılamaz — masaüstündeki "Borsayla karşılaştır" ile aynı):',
    '• Botun KENDİ önekli ama kaydında olmayan açık kademeli alım emirleri (sahipsiz) borsada İPTAL edilir. Sizin elle açtığınız emirlere dokunulmaz (önek taşımazlar).',
    '• Arada dolan emirler kayda işlenir; borsada bulunamayan merdiven basamakları yeniden kuyruğa alınır — botun dakikalık döngüsü bunları kendi planı gereği yeniden gönderebilir.',
    '• Fark yoksa kol engeli KALKAR (bot sonraki çalışmada işlem yapabilir); fark varsa kol ENGEL\'i konur / sürer ve Telegram\'a alarm gider.'];
  return { uygulanabilir: true, neden: null, baslik, satirlar, durum, plan: {},
    uyarilar: ['Riski hafif artırabilir: temiz çıkarsa kol engeli kalkar. Fark varsa önce kartın "Neyi saydı?" bölümünü okuyun; kayıt fark ediyorsa "Kaydı borsaya eşitle".'],
    sonraki: 'Sonuç (temiz / fark) hemen burada ve Sorunlar kartında görünür.' };
}

// ── 7. PUSULA'YI YENİDEN BAŞLAT (telefon) ──
const SAAT_MS = 60 * 60 * 1000;
/** Saf: telefondan yeniden başlatmanın kapalı olduğu pencere — TR 02:30–04:30 (UTC 23:30–01:30; günlük karar 03:02 çevresi). */
function ybPencerede(simdi = Date.now()) {
  const d = new Date(simdi), dk = d.getUTCHours() * 60 + d.getUTCMinutes();
  return dk >= 23 * 60 + 30 || dk < 90;
}
/** Saf: d = { denetleyici, son (ms|null), surum, baslangic (ms), suren: [görünen ad] }. */
function yenidenBaslatOnizleme(d = {}, simdi = Date.now()) {
  const durum = { surum: d.surum || null, baslangic: d.baslangic || null, son: d.son || null };
  const baslik = 'Pusula\'yı yeniden başlat';
  if (!d.denetleyici) return redOnizleme('Pusula denetleyiciyle (Pusula kısayolu / PusulaBot görevi) başlatılmamış: kapanırsa kendiliğinden geri açılmaz. Sunucu başında Pusula kısayoluyla açın.', { durum, baslik });
  if (ybPencerede(simdi)) return redOnizleme('TR 02:30–04:30 arası (botların günlük karar saati) telefondan yeniden başlatılmaz — 04:30\'dan sonra deneyin.', { durum, baslik });
  if (Number.isFinite(+d.son) && +d.son > 0 && simdi - +d.son < SAAT_MS) return redOnizleme(`Son yeniden başlatma ${trSaat(+d.son, simdi)} — saatte en çok bir kez; ${trSaat(+d.son + SAAT_MS, simdi)}'den sonra yeniden deneyin.`, { durum, baslik });
  if ((d.suren || []).length) return redOnizleme(`Şu an bot çalışması sürüyor (${d.suren.join(', ')}) — bitince (birkaç dakika) yeniden deneyin.`, { durum, baslik });
  const acik = Number.isFinite(+d.baslangic) && +d.baslangic > 0 ? Math.max(0, simdi - +d.baslangic) : null;
  const sure = acik == null ? '—' : acik < SAAT_MS ? `${Math.round(acik / 60000)} dk` : acik < 48 * SAAT_MS ? `${(acik / SAAT_MS).toFixed(1).replace('.', ',')} saat` : `${Math.round(acik / (24 * SAAT_MS))} gün`;
  return { uygulanabilir: true, neden: null, baslik, durum, plan: {},
    satirlar: [`Çalışan sürüm ${d.surum || '—'}, ${sure} süredir açık.`,
      'Pusula temiz kapanır; denetleyici ~10 saniye sonra AYNI kodla yeniden açar (güncelleme kurulmaz, ayar değişmez).',
      'Kapalıyken (yaklaşık 10–30 sn) botların dakikalık denetimi durur; açık pozisyonların felaket stopları borsada kalır. Botlar kayıtlı durumlarıyla (çalışıyor / durdu / güvenli kip / ENGEL) geri gelir.',
      'Panel bağlantısı kısa süre kopar; sayfa kendiliğinden yeniden bağlanır. Saatte en çok bir kez; TR 02:30–04:30 arası yapılamaz.'],
    uyarilar: ['Pusula geri açılmazsa telefondan açamazsınız: bekçi / PusulaBot görevi açar; açmazsa sunucu başında Pusula kısayolu. Telegram\'a "yeniden başlatılıyor" bilgisi gider; açılınca her zamanki açılış iletisi gelir.'],
    sonraki: 'Pusula ~10 saniye içinde yeniden açılır; sayfayı bir dakika sonra yenileyin.' };
}

// ── AÇIKLAYICILAR (salt okuma) ──
/**
 * Y-09b saf: pozisyon uyuşmazlığı açıklayıcısı — sembol başına borsa / bot kaydı / fark / son emirler / son dolum / stop-ADL olayı +
 * olası neden. @param o { farklar: [{symbol,borsa,don,dca,ek,fark}], emirler: { [symbol]: [...] }, korumaOlaylari: [{zaman,tur,symbol}],
 *   zorla: [{ zaman, metin }], simdi }
 */
function uyusmazlikAciklama({ farklar = [], emirler = {}, korumaOlaylari = [], zorla = [], simdi = Date.now() } = {}) {
  const satirlar = [];
  for (const f of farklar) {
    const c = coin(f.symbol);
    const l = emirler[f.symbol] || [];
    const kayit = (+f.don || 0) + (+f.dca || 0) + (+f.ek || 0);
    const sonEmir = l.slice(0, 2).map(e => `${Number.isFinite(e.olusturma) ? trSaat(e.olusturma, simdi) : '—'} ${KOL_AD[e.bot] || e.bot} ${e.side === 'sell' ? 'satış' : 'alış'} ${sy(e.amount)} ${e.durum}`).join(' · ') || '—';
    const dolum = l.filter(e => +e.dolan > 0).sort((a, b) => (b.guncelleme || b.olusturma || 0) - (a.guncelleme || a.olusturma || 0))[0];
    const stop = korumaOlaylari.filter(o => o.tur === 'tetiklendi' && o.symbol === f.symbol && simdi - o.zaman < 2 * GUN).sort((a, b) => b.zaman - a.zaman)[0];
    const adl = zorla.filter(z => simdi - z.zaman < GUN && new RegExp(`\\b${c}(USDT)?\\b`).test(String(z.metin || ''))).sort((a, b) => b.zaman - a.zaman)[0];
    const olay = [stop ? `stop ${trSaat(stop.zaman, simdi)}` : null, adl ? `${/ADL/.test(adl.metin) ? 'ADL' : 'likidasyon'} ${trSaat(adl.zaman, simdi)}` : null].filter(Boolean).join(' · ') || 'yok';
    const yeniEmir = l.some(e => Number.isFinite(e.olusturma) && simdi - e.olusturma < 10 * DK) || l.some(e => /GONDERILIYOR|BILINMIYOR|ACIK|KISMI/.test(e.durum) && Number.isFinite(e.olusturma) && simdi - e.olusturma < SAAT);
    const borsa = +f.borsa || 0;
    const neden = adl ? 'ADL / likidasyon — "Kaydı borsaya eşitle"'
      : stop ? 'felaket stopu tetiklendi — "Kaydı borsaya eşitle"'
        : yeniEmir ? 'gecikmeli dolum (yeni / açık emir) — 2 dk sonra "Borsayla karşılaştır"'
          : Math.abs(kayit) < 1e-12 && Math.abs(borsa) > 0 ? 'elle işlem (borsada botun bilmediği pozisyon) — o işlemi geri alın'
            : Math.abs(borsa) < 1e-12 ? 'pozisyon borsada kapanmış (stop / ADL / elle kapatma) — "Kaydı borsaya eşitle"'
              : 'belirsiz — elle işlem olabilir; "Sohbete gönder"';
    satirlar.push([c, sy(borsa), sy(kayit), sy(f.fark), sonEmir, dolum ? `${trSaat(dolum.guncelleme || dolum.olusturma, simdi)} ${sy(dolum.dolan)}` : '—', olay, neden]);
  }
  return satirlar.length ? { basliklar: ['Coin', 'Borsada', 'Bot kaydı', 'Fark', 'Son emirler', 'Son dolum', 'Stop / ADL', 'Olası neden'], satirlar } : null;
}

/** Y-14 saf: yürütücü frenDokumu() → "Neyi saydı?" { baslik, satirlar, tablo }. */
function frenNeyiSaydi(d, simdi = Date.now()) {
  if (!d) return null;
  const s = d.sayim || {}, n = d.sinir || {};
  const satirlar = [`Fren sebebi: ${(d.fren && d.fren.sebep) || '—'}${d.fren && d.fren.zaman ? ` (${trSaat(d.fren.zaman, simdi)})` : ''}`,
    `Şu anki sayım: 10 dk'da ${s.n10 || 0} / ${n.emir10dk ?? '?'} · 24 saatte ${s.n24 || 0} / ${n.emir24 ?? '?'} · nominal ${Math.round(s.nominal24 || 0)} / ${Math.round(n.nominal24 || 0)} USDT (nominale yalnız açık ya da dolan kısım sayılır)`];
  for (const e of (d.son || []).slice(0, 5)) satirlar.push(`${trSaat(e.olusturma, simdi)} · ${coin(e.symbol)} · ${KOL_AD[e.bot] || e.bot} · ${e.side === 'sell' ? 'satış' : 'alış'} ${sy(e.amount)} (dolan ${sy(e.dolan)}, ${e.durum})`);
  const tablo = (d.gruplar || []).length ? { basliklar: ['Coin', 'Kol', '24 sa emir', '10 dk', 'Nominal (USDT)', 'Dolmadan iptal'],
    satirlar: d.gruplar.slice(0, 12).map(g => [coin(g.symbol), KOL_AD[g.bot] || g.bot, String(g.n24), String(g.n10), String(Math.round(g.nominal)), String(g.iptal)]) } : null;
  return { baslik: 'Son 24 saatin risk artıran emirleri (coin / kol başına)', satirlar, tablo };
}

// ── ORKESTRASYON (PIN, onay, parmak izi, 409, olay kaydı, Telegram bilgisi) ──
const hata = (durum, mesaj, ek = {}) => Object.assign(new Error(mesaj), { durum, ek });

/**
 * @param o.botBul (ad) → { ad, mod, bot } | null · o.acilPin (lib/acilPin.js örneği — pinDogrula) · o.log (lv, msg)
 *        o.sonra () → void (uygulamadan sonra: Sorunlar önbelleğini boşalt)
 */
/**
 * 77.x ek kancalar: o.sistem { durum() → { denetleyici, son, surum, baslangic, suren }, yenidenBaslat({ kademe }) → Promise<ozet> } (yeniden-baslat);
 * o.karsilastir { nobet(ad) → Promise<metin|null>, yap(b) → Promise<{ engel }> } (borsa-karsilastir). Verilmezse o araç 409.
 */
function olustur({ botBul, acilPin, log = () => {}, sonra = () => {}, guvenliKipKalkti = () => {}, gecmis = () => {}, sistem = null, karsilastir = null } = {}) {
  async function karsilastirOnz(b) {
    let nobet = null;
    if (karsilastir && typeof karsilastir.nobet === 'function') { try { nobet = await karsilastir.nobet(b.ad); } catch { nobet = null; } }
    const suruyor = typeof b.bot.calismaSuruyor === 'function' ? !!b.bot.calismaSuruyor() : false;
    return karsilastirOnizleme({ kolEngel: (b.bot.kol && b.bot.kol.durum && b.bot.kol.durum.engel) || null, engel: b.bot.durum.engel || null, nobet, suruyor });
  }
  function sistemOnz() {
    if (!sistem || typeof sistem.durum !== 'function') return redOnizleme('Bu araç bu kurulumda yok.', { durum: { yok: true }, baslik: 'Pusula\'yı yeniden başlat' });
    return yenidenBaslatOnizleme(sistem.durum() || {});
  }
  function tamamlaSistem(arac, o) {
    const t = ARACLAR[arac];
    return { ...o, arac, ad: t.ad, bot: null, botAd: null, onayMetni: t.onayGoster || t.onay, parmak: parmak(o.durum), demoKabul: null };
  }
  function tanim(arac) { const t = ARACLAR[arac]; if (!t) throw hata(404, `bilinmeyen araç: ${arac}`); return t; }
  /** 77.x yerel araçlar (güvenli kip): önizleme bot.durum'dan, bot karar koduna dokunmadan. */
  function yerelOnizle(arac, b) {
    const d = { guvenliKip: b.bot.durum.guvenliKip || null, engel: b.bot.durum.engel || null, paraDurdurma: b.bot.durum.paraDurdurma || null };
    return arac === 'guvenli-kip-kaldir' ? gkKaldirOnizleme(d) : gkGirOnizleme(d);
  }
  /** Yerel aracı uygular — BindirmeBot.aracUygula ile aynı dönüş biçimi ({ mesgul } | { degisti, onizleme } | { red, onizleme } | { ozet, sonraki }). */
  function yerelUygula(arac, b, g, kademe) {
    if (b.bot.mesgul) return { mesgul: true };
    const onz = yerelOnizle(arac, b);
    if (parmak(onz.durum) !== g.parmak) return { degisti: true, onizleme: onz };
    if (!onz.uygulanabilir) return { red: onz.neden || 'uygulanamaz', onizleme: onz };
    const kim = kademe === 'telefon' ? 'telefondan' : kademe === 'gelistirme' ? 'geliştirme bilgisayarından' : 'panelden';
    if (arac === 'guvenli-kip-kaldir') {
      const k = b.bot.guvenliKipKaldir();
      if (!k) return { red: 'Güvenli kip kaldırılamadı (az önce kalkmış olabilir).', onizleme: yerelOnizle(arac, b) };
      try { guvenliKipKalkti(b.ad); } catch (e) { log('WARN', `🧰 öz denetim onayı yazılamadı: ${e.message}`); }
      try { gecmis({ tur: 'bot', farklar: [{ yol: `${b.ad}.guvenliKip`, eski: `${k.kaynak}: ${String(k.metin || '').slice(0, 160)}`, yeni: null }] }); } catch { /* geçmiş yazılamazsa araç durmaz */ }
      return { ozet: `güvenli kip kaldırıldı (${kim}; kaynak ${gkKaynak(k.kaynak).ad}: ${String(k.metin || '').slice(0, 160)})`, sonraki: onz.sonraki, sonuc: { kaldirilan: { kaynak: k.kaynak, metin: k.metin, zaman: k.zaman } } };
    }
    const metin = `kullanıcı elle güvenli kipe aldı (${kim}, PIN + onay)`;
    if (!b.bot.guvenliKipKoy('elle', metin)) return { red: 'Güvenli kipe alınamadı (az önce başka bir sebeple girmiş olabilir).', onizleme: yerelOnizle(arac, b) };
    try { gecmis({ tur: 'bot', farklar: [{ yol: `${b.ad}.guvenliKip`, eski: null, yeni: `elle: ${metin}` }] }); } catch { /* */ }
    return { ozet: `elle güvenli kipe alındı (${kim}) — yeni işlem açılmaz, stoplar korunur`, sonraki: onz.sonraki, sonuc: { guvenliKip: { kaynak: 'elle', metin } } };
  }
  function botAl(ad) { const b = botBul(ad); if (!b || !b.bot || typeof b.bot.aracOnizle !== 'function') throw hata(404, `bilinmeyen bot: ${ad}`); return b; }
  function tamamla(arac, b, o) {
    const t = ARACLAR[arac];
    return { ...o, arac, ad: t.ad, bot: b.ad, botAd: b.bot.adGorunen || b.ad, onayMetni: t.onayGoster || t.onay, parmak: parmak(o.durum),
      demoKabul: b.mod === 'demo' && !t.mudahaleDegil ? 'Demo hesap: bu müdahale prova günlüğüne "ölçümden düşülecek" diye yazılır.' : null };
  }
  async function onizle(arac, g = {}) {
    const t = tanim(arac);
    if (t.sembol && !String(g.sembol || '').trim()) throw hata(400, 'coin (sembol) gerekli');
    if (t.botsuz) return tamamlaSistem(arac, sistemOnz());
    const b = botAl(g.bot);
    if (arac === 'borsa-karsilastir') return tamamla(arac, b, await karsilastirOnz(b));
    if (t.yerel) return tamamla(arac, b, yerelOnizle(arac, b));
    return tamamla(arac, b, await b.bot.aracOnizle(arac, { sembol: g.sembol }));
  }
  /** @returns {{ durum, govde }} — HTTP durum + JSON gövde (sır içermez; PIN asla dönmez). */
  async function uygula(arac, g = {}, { kademe = 'yerel' } = {}) {
    let t, b;
    try { t = tanim(arac); if (!t.botsuz) b = botAl(g.bot); } catch (e) { return { durum: e.durum || 400, govde: { success: false, error: e.message } }; }
    if (t.sembol && !String(g.sembol || '').trim()) return { durum: 400, govde: { success: false, error: 'coin (sembol) gerekli' } };
    if (!/^[0-9a-f]{16}$/.test(String(g.parmak || ''))) return { durum: 400, govde: { success: false, error: 'Önce önizleme alın (parmak izi eksik).' } };
    if (onayNormal(g.onay) !== t.onay) return { durum: 400, govde: { success: false, error: `Onay için "${t.onayGoster || t.onay}" yazın.` } };
    const p = acilPin ? acilPin.pinDogrula(String(g.pin == null ? '' : g.pin).trim()) : { ok: false, durum: 403, hata: 'PIN modülü yok' };
    if (!p.ok) return { durum: p.durum || 403, govde: { success: false, pinHata: true, error: p.hata } };
    const kim = kademe === 'telefon' ? 'telefondan' : kademe === 'gelistirme' ? 'geliştirme bilgisayarından' : 'panelden';
    if (t.botsuz) {   // 77.x yeniden-baslat
      const onz = sistemOnz();
      if (parmak(onz.durum) !== g.parmak) return { durum: 409, govde: { success: false, kod: 'durum-degisti', error: 'Önizlemeden sonra durum değişti — hiçbir şey uygulanmadı. Yeni önizlemeyi okuyup yeniden onaylayın.', onizleme: tamamlaSistem(arac, onz) } };
      if (!onz.uygulanabilir) return { durum: 409, govde: { success: false, kod: 'uygulanamaz', error: onz.neden, onizleme: tamamlaSistem(arac, onz) } };
      let ozet;
      try { ozet = await sistem.yenidenBaslat({ kademe }); } catch (e) { log('ERROR', `🧰 Yeniden başlatma yapılamadı: ${e.message}`); return { durum: 500, govde: { success: false, error: e.message } }; }
      log('WARN', `🧰 Sorun aracı: Pusula yeniden başlatılıyor (${kim}, PIN + onay)`);
      return { durum: 200, govde: { success: true, arac, bot: null, ozet: ozet || 'Pusula yeniden başlatılıyor', sonraki: onz.sonraki, sonuc: null } };
    }
    let r;
    try {
      if (arac === 'borsa-karsilastir') {
        if (b.bot.mesgul) r = { mesgul: true };
        else {
          const onz = await karsilastirOnz(b);
          if (parmak(onz.durum) !== g.parmak) r = { degisti: true, onizleme: onz };
          else if (!onz.uygulanabilir) r = { red: onz.neden || 'uygulanamaz', onizleme: onz };
          else if (!karsilastir || typeof karsilastir.yap !== 'function') r = { red: 'Bu araç bu kurulumda yok.', onizleme: onz };
          else {
            const m = await karsilastir.yap(b);
            const temiz = !(m && m.engel);
            r = { ozet: `borsayla karşılaştırıldı (${kim}): ${temiz ? 'TEMİZ' : `fark var — ${String(m.engel).slice(0, 200)}`}`, sonuc: { mutabakat: { temiz, engel: (m && m.engel) || null } },
              sonraki: temiz ? 'Fark yok; kol engeli varsa kalktı.' : 'Fark sürüyor — Sorunlar kartındaki "Neyi saydı?" bölümüne bakın.' };
          }
        }
      } else if (t.yerel) r = yerelUygula(arac, b, g, kademe);
      else r = await b.bot.aracUygula(arac, { sembol: g.sembol }, (onz) => {
        if (parmak(onz.durum) !== g.parmak) return { degisti: true };
        if (!onz.uygulanabilir) return { red: onz.neden || 'uygulanamaz' };
        return null;
      });
    } catch (e) { log('ERROR', `🧰 Sorun aracı "${t.ad}" (${b.ad}) uygulanamadı: ${e.message}`); return { durum: 500, govde: { success: false, error: e.message } }; }
    if (r.mesgul) return { durum: 409, govde: { success: false, kod: 'mesgul', error: 'Bot şu an dakikalık işini yapıyor — birkaç saniye sonra yeniden deneyin.' } };
    if (r.degisti) return { durum: 409, govde: { success: false, kod: 'durum-degisti', error: 'Önizlemeden sonra durum değişti — hiçbir şey uygulanmadı. Yeni önizlemeyi okuyup yeniden onaylayın.', onizleme: tamamla(arac, b, r.onizleme) } };
    if (r.red) return { durum: 409, govde: { success: false, kod: 'uygulanamaz', error: r.red, onizleme: r.onizleme ? tamamla(arac, b, r.onizleme) : null } };
    // Kullanıcı 2026-10-24: "eşitleme olmazsa bot kararı yanlış olur; gerekirse kademeli alım emri kapansın" → eşitlemeden hemen sonra
    // "Borsayla karşılaştır" (mutabakat) KENDİLİĞİNDEN koşar; o coinde sahipsiz kalan bizim kademeli alım emirlerini mutabakat iptal eder.
    if (arac === 'kayit-esitle' && typeof b.bot.mutabakat === 'function') {
      try {
        const m = await b.bot.mutabakat({ kaynak: 'esitle' });
        const temiz = !(m && m.engel);
        r.sonuc = { ...(r.sonuc || {}), mutabakat: { temiz, engel: (m && m.engel) || null } };
        r.sonraki = temiz ? 'Borsayla karşılaştırma kendiliğinden yapıldı: TEMİZ — kol engeli kalktı.'
          : `Borsayla karşılaştırma kendiliğinden yapıldı ama hâlâ fark var: ${m.engel}. Sorunlar sayfasındaki karta bakın.`;
        r.ozet += temiz ? ' · karşılaştırma temiz' : ' · karşılaştırmada fark sürüyor';
      } catch (e) { r.sonraki = `Eşitlendi; kendiliğinden karşılaştırma yapılamadı (${e.message}) — "Borsayla karşılaştır" deyin.`; }
    }
    const ek = { kademe, ...(g.sembol ? { sembol: String(g.sembol).slice(0, 40) } : {}) };
    if (!t.mudahaleDegil) { try { b.bot.kullaniciMudahalesi(arac, r.ozet, ek); } catch (e) { log('WARN', `🧰 sorun aracı olay kaydı yazılamadı: ${e.message}`); } }
    log('WARN', `🧰 Sorun aracı: ${b.bot.adGorunen || b.ad} — ${r.ozet} (${kademe === 'telefon' ? 'telefondan' : kademe === 'gelistirme' ? 'geliştirme bilgisayarından' : 'panelden'}, PIN + onay)`);
    try {
      // 77.x: riski artıran araç (güvenli kipten çıkış) Telegram'a UYARI olarak gider (siz değilseniz hemen fark edin).
      const pr = b.bot._bildir && b.bot._bildir(t.riskArtirir ? 'uyari' : 'bilgi', `kullanıcı aracı: ${t.ad}`, [r.ozet, kademe === 'telefon' ? 'Telefondan, PIN + onayla yapıldı.' : 'PIN + onayla yapıldı.', r.sonraki || null,
        t.riskArtirir ? 'Bunu siz yapmadıysanız: hemen "Güvenli kipe al" ya da "Acil durdur" (telefondan da), sonra acil PIN\'i değiştirin.' : null,
        b.mod === 'demo' && !t.mudahaleDegil ? 'Demo kabul: prova günlüğüne ölçümden düşülecek müdahale olarak yazıldı.' : null], { anahtar: `arac:${arac}:${b.ad}:${Date.now()}` });
      if (pr && pr.catch) pr.catch(() => null);
    } catch { /* bildirim aracı durdurmaz */ }
    try { sonra(); } catch { /* */ }
    return { durum: 200, govde: { success: true, arac, bot: b.ad, ozet: r.ozet, sonraki: r.sonraki || null, sonuc: r.sonuc || null } };
  }
  return { onizle, uygula };
}

module.exports = { ARACLAR, KOL_AD, onayNormal, parmak, sembolEs, redOnizleme, esitlePlani, esitleOnizleme, k3Onizleme, sapmaDokumu, sapmaOnizleme, yatirmaOnizleme,
  gkKaynak, gkKaldirOnizleme, gkGirOnizleme, karsilastirOnizleme, yenidenBaslatOnizleme, ybPencerede,
  uyusmazlikAciklama, frenNeyiSaydi, olustur };
