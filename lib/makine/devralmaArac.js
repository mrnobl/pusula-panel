'use strict';
/**
 * TELEFONDAN DEVRALMA ARAÇLARI (77.8 — kullanıcı kararı 2026-10-26, taslak "Telefondan devralma": 4 ekran uyarı → önizleme → DEVRAL+PIN → sonuç)
 * ═══════════════════════════════════════════════════════════════════════════
 * Bozulan sunucunun botunu ayakta kalan sunucuya TELEFONDAN almak için üç sorun aracı (lib/sorunAraclari.js kalıbı: önce önizleme, sonra
 * acil PIN + onay kelimesi + önizlemenin parmak izi; arada durum değiştiyse 409 + yeni önizleme). Kurallar masaüstü devralmayla AYNI
 * (lib/makine/devralma.js — 30 dk sessizlik, taze yoklama, ağ bölünmesi, kopya SHA-256, canlı hesap ve Kairos demo kabulü devralınamaz);
 * bu modül yalnız önizleme metnini kurar ve mevcut devralma yöntemlerini çağırır.
 *
 *   devral            (onay DEVRAL)    önizleme: eşin sessizliği, son kopyanın yaşı, botun devralınabilirliği; "eski makinenin kapalı olduğunu
 *                                       biliyorum ya da yerinde değil" KUTUSU ZORUNLU (gövdede biliyorum: true — yoksa 400). Uygulama = devralma.devral.
 *   devral-sahiplen   (onay SAHİPLEN)  demo: borsadaki bu defterin bilmediği bizim emirler (önizleme listeyi borsadan TAZE okur — salt okuma);
 *                                       uygulama = devralma.sahiplen (liste değiştiyse 409 + yeni liste). PIN her seferinde (araç kuralı).
 *   devral-baslat     (onay BASLAT)    YALNIZ yeni devralınmış ve devralmadan beri hiç başlatılmamış bota, BİR KEZ (devralma.baslatBayragi:
 *                                       başlatılınca ya da 24 saat geçince düşer). Mutabakat temiz olmalı; nöbet kapısı (taze eş yoklaması)
 *                                       lib/sorunAraclari.js'te uygulamadan önce. Genel Başlat (POST /api/bindirme/:ad/baslat) telefonda 403 KALIR.
 *
 * Her telefondan uygulama Telegram'a ALARM gider (bildirim merkezi "güvenlik" sınıfı — sessiz saatte de; lib/bildirimMerkezi.js GUVENLIK_RE):
 * "… telefondan devralındı / sahiplenildi / başlatıldı — siz değilseniz hemen acil durdurun".
 * Bu modül ağ, alt süreç, PowerShell kullanmaz; dosya yazmaz (yazan devralma.js ve sunucu bağdaştırıcısı).
 */
const D = require('./devralma');

const dk = (ms) => { const d = Math.max(0, Math.round(ms / 60000)); return d < 60 ? `${d} dk` : d < 48 * 60 ? `${Math.floor(d / 60)} sa ${d % 60} dk` : `${Math.round(d / 1440)} gün`; };
const trSaat = (iso) => { const t = Date.parse(iso || ''); if (!Number.isFinite(t)) return '—'; const d = new Date(t + 3 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const MOD = { kagit: 'kâğıt', demo: 'demo', canli: 'canlı hesap' };
const red = (neden, ek = {}) => ({ uygulanabilir: false, neden, satirlar: [], uyarilar: [], durum: { red: neden }, ...ek });

/* ══ Saf önizlemeler (liste = devralma.liste() çıktısı) ══ */

/** Saf: devral önizlemesi. g = { es, bot }. */
function devralOnizleme(liste, g = {}, simdi = Date.now()) {
  const l = liste || {};
  const baslik = 'Botu bu makineye devral';
  if (l.rol !== 'sunucu') return red('Bu bilgisayar geliştirme / araştırma kopyası — devralma bot çalıştıracak sunucuda yapılır.', { baslik });
  const es = (l.esler || []).find(x => x.kimlik === g.es);
  if (!es) return red('Bu kimlikte eşlenmiş sunucu yok (Ayarlar › Makineler).', { baslik });
  const b = (es.botlar || []).find(x => x.kimlik === g.bot);
  const botAd = b ? (b.adGorunen || b.kimlik) : String(g.bot || '');
  const bas = `${botAd}: ${es.ad} makinesinden devral`;
  const durum = { es: es.kimlik, bot: g.bot || null, sessiz: !!es.sessiz, kopya: es.kopya && es.kopya.var ? (es.kopya.kaynakZaman || 'var') : null, dev: b ? !!b.devralinabilir : null, kod: b ? b.kod || null : null,
    burada: !!(b && b.burada && b.burada.var), devralindi: (l.devralinanlar || []).some(d => d.kimlik === g.bot && d.asama === 'geldi' && d.kaynak === es.kimlik) };
  if (!es.kopya || !es.kopya.var) return red(`${es.ad} makinesinin kopyası bu bilgisayarda yok — devralma son eş kopyasından yapılır.`, { baslik: bas, durum });
  if (!b) return red(`${es.ad} kopyasında "${g.bot}" botu yok.`, { baslik: bas, durum });
  if (durum.devralindi) return red(`${botAd} zaten ${es.ad} makinesinden bu bilgisayara devralındı — sıradaki adım Sorunlar sayfasındaki "devralınan bot" kartında.`, { baslik: bas, durum });
  if (!b.devralinabilir) return red(`Devralınamaz: ${b.neden || '—'}`, { baslik: bas, durum });
  if (!es.sessiz) return red(es.sessizNeden || `${es.ad} sessiz değil — devralma yalnız ${l.esikDk || 30} dakikadan uzun sessiz makineden.`, { baslik: bas, durum });
  const satirlar = [
    `${es.ad}: ${Number.isFinite(es.sessizDk) ? `${dk(es.sessizDk * 60000)} ses yok` : 'ses yok'} (son temas ${trSaat(es.sonTemas)}; eşik ${l.esikDk || 30} dk).`,
    `Son kopya: ${trSaat(es.kopya.kaynakZaman)}${Number.isFinite(es.kopya.yasDk) ? ` (${dk(es.kopya.yasDk * 60000)} önce)` : ''} · ${es.kopya.dosya || 0} dosya${es.kopya.gizli === 'var' ? ' · şifreli anahtar var' : ''}. Uygularken her dosya SHA-256 ile yeniden denetlenir.`,
    `Bot: ${botAd} · ${MOD[b.mod] || b.mod || '—'} · kopyadaki nöbet ${b.nobet || 0} → bu makinede daha yeni nöbet (eski makine geri gelirse botu BAŞLATMAZ; çalışır hâlde gelirse ilk nabızda DURDURUR).`,
    'Uygularken öbür sunucular taze yoklanır: eski makine ulaşılabilir çıkarsa ya da başka bir sunucu onu son 30 dakikada gördüyse devralma yapılmaz.',
    'Bot burada kendiliğinden BAŞLAMAZ. Borsaya emir gönderilmez.',
    b.mod === 'demo' ? 'Sonra: borsadaki, bu botun bilmediği bizim emirlerin listesini onaylarsınız (SAHİPLEN, PIN yeniden); temizse bu sayfadan BİR KEZ Başlat (PIN).'
      : 'Sonra: kâğıt borsayla karşılaştırma kendiliğinden yapılır; temizse bu sayfadan BİR KEZ Başlat (PIN).'];
  if (b.burada && b.burada.var) satirlar.push(`Bu bilgisayarda aynı kimlikli bir bot var (${MOD[b.burada.mod] || b.burada.mod || '—'}) — verisi silinmez, onceki-bot klasörüne kaldırılır.`);
  const uyarilar = ['Eski makine AÇIK ama yalnız ağı kopuksa, ağ gelene kadar iki makine aynı borsa hesabına emir gönderebilir. Bunu telefondan bilemezsiniz — emin değilseniz devralmayın.'];
  if (es.kopya.eski) uyarilar.push('Kopya ESKİ (6 saatten fazla): devralınan bot bu andan sonra olanları bilmez.');
  if (l.yedekSifre === false && b.mod === 'demo') uyarilar.push('Bu bilgisayarda yedek şifresi yok — demo botun anahtarı çözülemez, devralma 409 verir (Ayarlar › Yedek & taşıma, sunucu başında).');
  return { uygulanabilir: true, neden: null, baslik: bas, satirlar, uyarilar, durum, plan: { es: es.kimlik, bot: b.kimlik, mod: b.mod },
    kutu: `${es.ad} makinesinin kapalı olduğunu biliyorum ya da yerinde değil (bozuldu, elektrik yok, çalındı).`,
    botAdi: botAd, sonraki: b.mod === 'demo' ? 'Sorunlar sayfasında "emir listesini onayla" kartı çıkar.' : 'Karşılaştırma temizse Sorunlar sayfasında "Başlat (bir kez)" kartı çıkar.' };
}

/** Saf: sahiplen önizlemesi. d = liste.devralinanlar satırı. */
function sahiplenOnizleme(d) {
  const baslik = 'Devralınan botun emir listesini onayla';
  if (!d || d.asama !== 'geldi') return red('Bu bot için süren devralma yok.', { baslik });
  const ad = d.adGorunen || d.kimlik;
  const bas = `${ad}: borsadaki emir listesini onayla (SAHİPLEN)`;
  const durum = { bot: d.kimlik, ozet: d.sahiplen && !d.sahiplen.hata ? d.sahiplen.ozet || null : null, mutabakat: d.mutabakat || 'bekliyor' };
  if (d.mod !== 'demo') return red('Kâğıt botta sahiplen yok — karşılaştırma kendiliğinden yapılır.', { baslik: bas, durum });
  if (!['bekliyor', 'sahiplen-bekliyor', 'elle'].includes(durum.mutabakat)) return red(`Bu botun devralma karşılaştırması tamamlandı (${durum.mutabakat === 'temiz' ? 'TEMİZ' : durum.mutabakat === 'engel' ? `TEMİZ DEĞİL: ${d.mutabakatNeden || '—'}` : durum.mutabakat}).`, { baslik: bas, durum });
  if (d.sahiplen && d.sahiplen.hata) return red(`Borsadaki emir listesi okunamadı: ${d.sahiplen.hata} — birkaç dakika sonra önizlemeyi yeniden açın.`, { baslik: bas, durum });
  if (!durum.ozet) return red('Borsadaki emir listesi henüz alınmadı — birkaç saniye sonra yeniden deneyin.', { baslik: bas, durum });
  const acik = d.sahiplen.acik || [], kap = d.sahiplen.kapanmis || [];
  const satir = (e, tur) => [tur, String(e.id || ''), `${e.symbol || '—'} · ${e.side || '—'} · ${e.type || '—'}`, `${e.amount}${e.dolan ? ` (dolan ${e.dolan})` : ''} · ${e.durum || ''}`, e.etki || ''];
  const tablo = acik.length || kap.length ? { basliklar: ['Tür', 'Emir kimliği', 'Sembol · yön · tür', 'Miktar · durum', 'Ne olur'], satirlar: [...acik.map(e => satir(e, 'açık')), ...kap.map(e => satir(e, 'kapanmış'))] } : null;
  const satirlar = [
    `Borsada bu botun defterinin bilmediği ${acik.length} açık + ${kap.length} kapanmış bizim emrimiz var (son kopyadan sonra eski makinenin verdiği emirler)${d.sahiplen.destek === false ? ' — kapanmış emir listesi bu borsada okunamıyor' : ''}.`,
    'Onaylanınca listedeki emirler deftere alınır; emir kimliği sayacı onların üstüne çıkar (eski makinenin kimliği yeniden üretilmez).',
    'Sonra botun kendi karşılaştırması: botun bilmediği açık emir "sahipsiz" sayılıp borsada İPTAL edilir (bot kendi emrini sonra yeniden koyar); bilinmeyen dolumdan doğan pozisyon farkı ENGEL olarak kalır.',
    'Yeni emir GÖNDERİLMEZ. Liste siz bakarken değişirse hiçbir şey uygulanmaz; yeni liste gelir.'];
  return { uygulanabilir: true, neden: null, baslik: bas, satirlar, tablo, durum, plan: { ozet: durum.ozet },
    uyarilar: ['Acil PIN bu onay için de istenir (her seferinde).'], botAdi: ad, sonraki: 'Temizse Sorunlar sayfasında "Başlat (bir kez)" kartı çıkar.' };
}

/** Saf: başlat önizlemesi. d = liste.devralinanlar satırı; ek = { bekliyor (taşıma-bekliyor işareti), simdi }. */
function baslatOnizleme(d, { bekliyor = false, simdi = Date.now() } = {}) {
  const baslik = 'Devralınan botu başlat (bir kez)';
  const genel = 'Telefondan Başlat yalnız YENİ devralınmış ve o zamandan beri hiç başlatılmamış bota, bir kez yapılır; öbür durumlarda Başlat sunucudaki panelde.';
  if (!d || d.asama !== 'geldi') return red(`Bu bot bu makineye devralınmadı. ${genel}`, { baslik, durum: { bot: d ? d.kimlik : null, yok: true } });
  const ad = d.adGorunen || d.kimlik;
  const bas = `${ad}: başlat (devralmadan sonra bir kez)`;
  const durum = { bot: d.kimlik, nobet: d.nobet || 0, mutabakat: d.mutabakat || 'bekliyor', baslatildi: !!d.baslatildi, calisiyor: !!d.calisiyor, bayrak: !!d.telefonBaslat, bekliyor: !!bekliyor };
  if (d.baslatildi) return red(`${ad} devralmadan sonra zaten başlatıldı (${trSaat(d.baslatildi)}). ${genel}`, { baslik: bas, durum });
  if (d.calisiyor) return red(`${ad} zaten çalışıyor.`, { baslik: bas, durum });
  if (!d.telefonBaslat) return red(`Devralmanın üstünden 24 saat geçti — telefondan Başlat süresi doldu. ${genel}`, { baslik: bas, durum });
  if (d.mod === 'canli') return red('Canlı hesap botu devralınamaz ve telefondan başlatılmaz.', { baslik: bas, durum });
  if (d.mod === 'demo' && ['bekliyor', 'sahiplen-bekliyor', 'elle'].includes(durum.mutabakat)) return red('Önce borsadaki emir listesini onaylayın (SAHİPLEN) — onaydan önce Başlat kapalı.', { baslik: bas, durum });
  if (durum.mutabakat === 'engel') return red(`Borsayla karşılaştırma TEMİZ DEĞİL: ${d.mutabakatNeden || '—'} — Başlat kapalı (fark sunucudaki panelde giderilir).`, { baslik: bas, durum });
  if (durum.mutabakat !== 'temiz') return red(durum.mutabakat === 'elle' ? `Karşılaştırma yapılamadı: ${d.mutabakatNeden || '—'} — sunucudaki panelde Mutabakat.` : 'Borsayla karşılaştırma sürüyor — birkaç saniye sonra yeniden deneyin.', { baslik: bas, durum });
  if (bekliyor) return red('Bot ilk temiz borsa karşılaştırmasını bekliyor (taşıma işareti) — birkaç saniye sonra yeniden deneyin.', { baslik: bas, durum });
  const kalan = Date.parse(d.telefonBaslatBitis || '') - simdi;
  return { uygulanabilir: true, neden: null, baslik: bas, durum, plan: {}, botAdi: ad,
    satirlar: [`${ad} ${d.kaynakAd || d.kaynak || 'öteki makine'} makinesinden devralındı (nöbet ${d.nobet || 0}, ${trSaat(d.zaman)}); borsayla karşılaştırma TEMİZ.`,
      `Başlayınca: dakikalık döngü ve günlük karar (03:02) bu makinede çalışır — bot ${MOD[d.mod] || d.mod} hesapta YENİ İŞLEM AÇABİLİR. Kaçan günleri kendisi sayar; geçmiş günlerin emirlerini vermez.`,
      'Başlatmadan hemen önce öbür sunuculara taze nöbet sorulur (bot başka makinede daha yeni nöbetle çalışıyorsa başlamaz).',
      `Bu düğme bir kez çalışır${Number.isFinite(kalan) && kalan > 0 ? ` (${dk(kalan)} daha açık)` : ''}; sonra Durdur / Başlat sunucudaki panelde. Acil durdurma telefondan her zaman açık.`],
    uyarilar: ['Riski artıran yön: eski makine açık ama ağı kopuksa iki makine aynı hesaba emir gönderebilir — eski makinenin kapalı olduğundan emin değilseniz başlatmayın.'],
    sonraki: 'Bot bu makinede çalışıyor; Telegram\'a güvenlik iletisi gider (sessiz saatte de).' };
}

/* ══ Kurucu ══ */

/**
 * @param o.devralma   () → lib/makine/devralma örneği (liste, devral, sahiplenListe, sahiplen, baslatildi) | null
 * @param o.botBekliyor (k) → bool  (lib/tasima.js botBekliyor — taşıma / devralma sonrası ilk temiz mutabakat işareti)
 * @param o.baslat     async (k) → void  (POST /api/bindirme/:ad/baslat ile AYNI adımlar: demo çakışma denetimi, bağlan, bot.baslat)
 * @param o.bildir     (tur, baslik, satirlar) → Telegram
 * @param o.log        (lv, msg)
 * @param o.ben        () → { ad }
 */
function olustur(o = {}) {
  const log = o.log || (() => {});
  const bildir = o.bildir || (() => {});
  const simdi = o.simdi || Date.now;
  const DV = () => { const x = typeof o.devralma === 'function' ? o.devralma() : o.devralma; if (!x) throw Object.assign(new Error('devralma bu kurulumda yok'), { durum: 409 }); return x; };
  const devralinan = (k) => ((DV().liste().devralinanlar) || []).find(d => d.kimlik === k) || null;
  const kimMetin = (kademe) => (kademe === 'telefon' ? 'telefondan' : kademe === 'gelistirme' ? 'geliştirme bilgisayarından' : 'panelden (sorun aracı)');
  const benAd = () => { try { return (o.ben && o.ben().ad) || 'bu sunucu'; } catch { return 'bu sunucu'; } };
  const SON = ' — siz değilseniz hemen acil durdurun';
  const alarmSatir = (kademe) => [kademe === 'telefon' ? 'Telefondan, acil PIN + onay kelimesiyle yapıldı.' : 'Acil PIN + onay kelimesiyle yapıldı.',
    'Bunu siz yapmadıysanız: hemen "Acil durdur" (telefondan da), sonra acil PIN\'i ve panel jetonunu değiştirin (npm run telefon-jeton -- --yeni).'];

  async function onizle(arac, g = {}) {
    if (arac === 'devral') return devralOnizleme(DV().liste(), { es: String(g.es || ''), bot: String(g.bot || '') }, simdi());
    const k = String(g.bot || '');
    if (arac === 'devral-sahiplen') {
      // Önizleme listeyi borsadan TAZE okur (salt okuma; durum.sahiplen'e yazılır) — telefonda "Listeyi yenile" yok.
      const d0 = devralinan(k);
      if (d0 && d0.mod === 'demo' && ['bekliyor', 'sahiplen-bekliyor', 'elle'].includes(d0.mutabakat || 'bekliyor')) {
        try { await DV().sahiplenListe(k); } catch (e) { log('WARN', `🛟 ${k}: sahiplen listesi yenilenemedi: ${e.message}`); }
      }
      return sahiplenOnizleme(devralinan(k));
    }
    if (arac === 'devral-baslat') return baslatOnizleme(devralinan(k), { bekliyor: !!(o.botBekliyor && o.botBekliyor(k)), simdi: simdi() });
    throw Object.assign(new Error(`bilinmeyen araç: ${arac}`), { durum: 404 });
  }

  /**
   * Uygular (PIN, onay, kutu ve nöbet kapısı lib/sorunAraclari.js'te önce denetlenir). parmakFn = sorunAraclari.parmak.
   * @returns { degisti, onizleme } | { red, onizleme } | { hata: { durum, govde } } | { ozet, sonraki, sonuc }
   */
  async function uygula(arac, g = {}, { kademe = 'yerel', parmakFn } = {}) {
    const kim = kimMetin(kademe);
    if (arac === 'devral') {
      const onz = devralOnizleme(DV().liste(), { es: String(g.es || ''), bot: String(g.bot || '') }, simdi());
      if (parmakFn(onz.durum) !== g.parmak) return { degisti: true, onizleme: onz };
      if (!onz.uygulanabilir) return { red: onz.neden, onizleme: onz };
      const x = await DV().devral({ es: onz.plan.es, bot: onz.plan.bot });
      if (x.durum !== 200) return { hata: x };
      const r = x.govde;
      log('WARN', `🛟 "${r.adGorunen || r.bot}" ${kim} devralındı (${r.kaynakAd || r.kaynak} → ${benAd()}, nöbet ${r.nobet}; kutu işaretli, PIN + DEVRAL)`);
      bildir('alarm', `${r.adGorunen || r.bot} ${kademe === 'telefon' ? 'telefondan devralındı' : 'sorun aracıyla devralındı'}${SON}`, [
        `${r.kaynakAd || r.kaynak} makinesinin son kopyasından ${benAd()} makinesine alındı (nöbet ${r.nobet}). Bot kendiliğinden başlamaz.`, ...alarmSatir(kademe)]);
      return { ozet: `${r.adGorunen || r.bot} ${r.kaynakAd || r.kaynak} makinesinden devralındı (nöbet ${r.nobet}, ${kim})`, sonraki: onz.sonraki,
        sonuc: { bot: r.bot, nobet: r.nobet, mod: r.mod, sonrakiAdim: r.sonraki, uyarilar: r.uyarilar || [] } };
    }
    const k = String(g.bot || '');
    if (arac === 'devral-sahiplen') {
      const onz = sahiplenOnizleme(devralinan(k));   // önizlemede alınan liste (yeniden okumadan) — onay o listeye bağlı
      if (parmakFn(onz.durum) !== g.parmak) return { degisti: true, onizleme: onz };
      if (!onz.uygulanabilir) return { red: onz.neden, onizleme: onz };
      const x = await DV().sahiplen({ bot: k, ozet: onz.plan.ozet });   // borsayı yeniden okur; liste değiştiyse 409 liste-degisti
      if (x.durum === 409 && x.govde && x.govde.kod === 'liste-degisti') return { degisti: true, onizleme: sahiplenOnizleme(devralinan(k)) };
      if (x.durum !== 200) return { hata: x };
      const r = x.govde;
      const ad = onz.botAdi;
      log('WARN', `🛟 ${ad}: devralma emir listesi ${kim} sahiplenildi (PIN + SAHİPLEN) — ${r.temiz ? 'TEMİZ' : `TEMİZ DEĞİL: ${r.neden}`}`);
      bildir('alarm', `${ad}: devralma emir listesi ${kademe === 'telefon' ? 'telefondan sahiplenildi' : 'sorun aracıyla sahiplenildi'}${SON}`, [
        `${(r.sonuc && (r.sonuc.acik + r.sonuc.kapanmis)) || 0} emir deftere alındı; ${(r.sonuc && r.sonuc.sahipsizIptal) || 0} sahipsiz emir iptal edildi. Karşılaştırma: ${r.temiz ? 'TEMİZ' : `TEMİZ DEĞİL (${String(r.neden || '').slice(0, 160)})`}.`, ...alarmSatir(kademe)]);
      return { ozet: `emir listesi deftere alındı (${kim}) — karşılaştırma ${r.temiz ? 'TEMİZ' : 'TEMİZ DEĞİL'}`, sonraki: r.temiz ? 'Sorunlar sayfasında "Başlat (bir kez)" kartı çıkar.' : `Başlat kapalı: ${String(r.neden || '').slice(0, 200)}`,
        sonuc: { temiz: !!r.temiz, neden: r.neden || null, sayilar: r.sonuc || null } };
    }
    if (arac === 'devral-baslat') {
      const onz = baslatOnizleme(devralinan(k), { bekliyor: !!(o.botBekliyor && o.botBekliyor(k)), simdi: simdi() });
      if (parmakFn(onz.durum) !== g.parmak) return { degisti: true, onizleme: onz };
      if (!onz.uygulanabilir) return { red: onz.neden, onizleme: onz };
      if (typeof o.baslat !== 'function') return { red: 'Başlatma bu kurulumda yok.', onizleme: onz };
      try { await o.baslat(k); } catch (e) { return { hata: { durum: e.durum || 409, govde: { success: false, error: `Başlatılamadı: ${e.message}` } } }; }
      try { DV().baslatildi(k, kademe); } catch (e) { log('ERROR', `🛟 ${k}: başlat bayrağı düşürülemedi: ${e.message}`); }
      const ad = onz.botAdi;
      log('WARN', `🛟 ${ad} devralmadan sonra ${kim} BAŞLATILDI (PIN + BAŞLAT, nöbet ${onz.durum.nobet})`);
      bildir('alarm', `${ad} ${kademe === 'telefon' ? 'telefondan başlatıldı' : 'sorun aracıyla başlatıldı'}${SON}`, [
        `Devralmadan sonra ${benAd()} makinesinde başlatıldı (nöbet ${onz.durum.nobet}); bot yeni işlem açabilir.`, ...alarmSatir(kademe)]);
      return { ozet: `${ad} başlatıldı (${kim}; devralmadan sonra bir kez)`, sonraki: onz.sonraki, sonuc: { calisiyor: true } };
    }
    return { hata: { durum: 404, govde: { success: false, error: `bilinmeyen araç: ${arac}` } } };
  }

  return { onizle, uygula };
}

module.exports = { olustur, devralOnizleme, sahiplenOnizleme, baslatOnizleme, BAYRAK_MS: D.BAYRAK_MS };
