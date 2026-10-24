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
};
const KOL_AD = { kn: 'trend kolu', kd: 'kademeli alım', bt: 'BTC ayağı' };

// ── yardımcılar ──
const sy = (x) => (Number.isFinite(+x) ? String(+(+x).toFixed(8)) : '—');
const coin = (s) => String(s || '').split('/')[0];
/** Onay metni: büyük harf, Türkçe harfler sadeleşir ("eşitle" = "ESITLE"). */
const onayNormal = (s) => String(s == null ? '' : s).trim().toLocaleUpperCase('tr-TR')
  .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C');
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
function olustur({ botBul, acilPin, log = () => {}, sonra = () => {} } = {}) {
  function tanim(arac) { const t = ARACLAR[arac]; if (!t) throw hata(404, `bilinmeyen araç: ${arac}`); return t; }
  function botAl(ad) { const b = botBul(ad); if (!b || !b.bot || typeof b.bot.aracOnizle !== 'function') throw hata(404, `bilinmeyen bot: ${ad}`); return b; }
  function tamamla(arac, b, o) {
    const t = ARACLAR[arac];
    return { ...o, arac, ad: t.ad, bot: b.ad, botAd: b.bot.adGorunen || b.ad, onayMetni: t.onay, parmak: parmak(o.durum),
      demoKabul: b.mod === 'demo' ? 'Demo hesap: bu müdahale prova günlüğüne "ölçümden düşülecek" diye yazılır.' : null };
  }
  async function onizle(arac, g = {}) {
    const t = tanim(arac);
    if (t.sembol && !String(g.sembol || '').trim()) throw hata(400, 'coin (sembol) gerekli');
    const b = botAl(g.bot);
    return tamamla(arac, b, await b.bot.aracOnizle(arac, { sembol: g.sembol }));
  }
  /** @returns {{ durum, govde }} — HTTP durum + JSON gövde (sır içermez; PIN asla dönmez). */
  async function uygula(arac, g = {}, { kademe = 'yerel' } = {}) {
    let t, b;
    try { t = tanim(arac); b = botAl(g.bot); } catch (e) { return { durum: e.durum || 400, govde: { success: false, error: e.message } }; }
    if (t.sembol && !String(g.sembol || '').trim()) return { durum: 400, govde: { success: false, error: 'coin (sembol) gerekli' } };
    if (!/^[0-9a-f]{16}$/.test(String(g.parmak || ''))) return { durum: 400, govde: { success: false, error: 'Önce önizleme alın (parmak izi eksik).' } };
    if (onayNormal(g.onay) !== t.onay) return { durum: 400, govde: { success: false, error: `Onay için "${t.onay}" yazın.` } };
    const p = acilPin ? acilPin.pinDogrula(String(g.pin == null ? '' : g.pin).trim()) : { ok: false, durum: 403, hata: 'PIN modülü yok' };
    if (!p.ok) return { durum: p.durum || 403, govde: { success: false, pinHata: true, error: p.hata } };
    let r;
    try {
      r = await b.bot.aracUygula(arac, { sembol: g.sembol }, (onz) => {
        if (parmak(onz.durum) !== g.parmak) return { degisti: true };
        if (!onz.uygulanabilir) return { red: onz.neden || 'uygulanamaz' };
        return null;
      });
    } catch (e) { log('ERROR', `🧰 Sorun aracı "${t.ad}" (${b.ad}) uygulanamadı: ${e.message}`); return { durum: 500, govde: { success: false, error: e.message } }; }
    if (r.mesgul) return { durum: 409, govde: { success: false, kod: 'mesgul', error: 'Bot şu an dakikalık işini yapıyor — birkaç saniye sonra yeniden deneyin.' } };
    if (r.degisti) return { durum: 409, govde: { success: false, kod: 'durum-degisti', error: 'Önizlemeden sonra durum değişti — hiçbir şey uygulanmadı. Yeni önizlemeyi okuyup yeniden onaylayın.', onizleme: tamamla(arac, b, r.onizleme) } };
    if (r.red) return { durum: 409, govde: { success: false, kod: 'uygulanamaz', error: r.red, onizleme: r.onizleme ? tamamla(arac, b, r.onizleme) : null } };
    const ek = { kademe, ...(g.sembol ? { sembol: String(g.sembol).slice(0, 40) } : {}) };
    try { b.bot.kullaniciMudahalesi(arac, r.ozet, ek); } catch (e) { log('WARN', `🧰 sorun aracı olay kaydı yazılamadı: ${e.message}`); }
    log('WARN', `🧰 Sorun aracı: ${b.bot.adGorunen || b.ad} — ${r.ozet} (${kademe === 'telefon' ? 'telefondan' : kademe === 'gelistirme' ? 'geliştirme bilgisayarından' : 'panelden'}, PIN + onay)`);
    try {
      const pr = b.bot._bildir && b.bot._bildir('bilgi', `kullanıcı aracı: ${t.ad}`, [r.ozet, kademe === 'telefon' ? 'Telefondan, PIN + onayla yapıldı.' : 'PIN + onayla yapıldı.', r.sonraki || null,
        b.mod === 'demo' ? 'Demo kabul: prova günlüğüne ölçümden düşülecek müdahale olarak yazıldı.' : null], { anahtar: `arac:${arac}:${b.ad}:${Date.now()}` });
      if (pr && pr.catch) pr.catch(() => null);
    } catch { /* bildirim aracı durdurmaz */ }
    try { sonra(); } catch { /* */ }
    return { durum: 200, govde: { success: true, arac, bot: b.ad, ozet: r.ozet, sonraki: r.sonraki || null, sonuc: r.sonuc || null } };
  }
  return { onizle, uygula };
}

module.exports = { ARACLAR, KOL_AD, onayNormal, parmak, sembolEs, redOnizleme, esitlePlani, esitleOnizleme, k3Onizleme, sapmaDokumu, sapmaOnizleme, yatirmaOnizleme,
  uyusmazlikAciklama, frenNeyiSaydi, olustur };
