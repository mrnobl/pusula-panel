/**
 * PORTFÖY TASARIMCISI — ZAMANLAYICI (30 dk tik). PLAN-PORTFOY-TASARIMCI.md (a) katman 1, (d) Zamanlayıcı.
 * Öz test: node scripts/tasarimci-selftest.js (H–I) · elle: npm run tasarimci:tik [-- --veri] [-- --json]
 *
 * tik({ simdi?, piyasa?, uyelikAl?, fetch?, kayitDizini?, log? }) — SIRA (hepsi idempotent; iki kez koşmak dosyaları değiştirmez):
 *   1. Nasdaq-100 bu ayın anlık üyelik görüntüsü yoksa alınır (uyelik.anlikGoruntuAl; dondurulur; hata → bayat uyarısı).
 *   2. Her seri (lib/tasarimci/model.js SIRA) son yazılı günden bugüne ilerletilir: ay sonu kararı (veriTam şartı, yalnız karar
 *      gününe kadar veri, eksikVeri uyarısı kayda) → uygulama günü açılış dolumu → TAMAMLANAN her gün için bir gunluk satırı
 *      (eksik veride gün yazılmaz, veriNotu). İlk çalışmada 2026-10-12'den bugüne geçmiş günler doldurulur.
 *   3. Yeni karar varsa `emirler/YYYY-MM.json` (uygulama ayı) hedef listesi taslağı (F4 gerçek emir tablosunu dolduracak).
 *   4. Dondurma mutabakatı: yazılı satırlar güncel veriyle baştan üretilir; fark → uyarı (satırlar DEĞİŞMEZ).
 *   5. Tamamlanan her ay için `kayitlar/model-portfoy/YYYY-MM.json` (yalnız endeks + kol getirileri + dondurulmuş listeler +
 *      SHA-256 zinciri; TUTAR YOK). Geliştirme makinesinde git'e değil data/tasarimci/disari/model-portfoy/'ya (deneme).
 *      Sunucu git çalıştırmaz.
 *   6. durum.json (son tik özeti).
 * Süreçler arası kilit (defter.kilitle): sunucu zamanlayıcısı ile `npm run tasarimci:tik` aynı anda yazamaz.
 * "ev" makinesinde defterde deneme / gelistirme kaydı görülürse tik REDDEDİLİR (hiçbir şey yazmaz, durum.json'da açık uyarı):
 * geliştirme kopyası sunucuya taşınırsa resmî seri kirlenmesin. Sunucuda alt süreç 15 dk'da bitmezse öldürülür (WARN + durum.json).
 *
 * kur({ log, veriOrk, betik? }) → { baslat(), durdur(), tetikle(neden) → { baslatildi | calisiyor }, durum() }
 *   Sunucuda ağır iş (M10 + BIST + Hücum simülasyonu ≈ 5–10 sn CPU) ALT SÜREÇTE koşar (scripts/tasarimci-tik.js) — olay döngüsü
 *   bloklanmaz. Her tetikte önce veri talebi (orkestratör talep: bayat kaynaklar arka planda tazelenir; beklemez).
 *   Açılıştan 3 dk sonra, sonra 30 dk'da bir. TASARIMCI=0 kapatır (baslat hiçbir şey kurmaz).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./takvim');
const DF = require('./defter');
const MD = require('./model');

const PROJE = path.join(__dirname, '..', '..');
const ARALIK_MS = 30 * 60e3, ACILIS_MS = 3 * 60e3, ZAMAN_ASIMI_MS = 15 * 60e3;
const ALARM_ESIK = 3;   // O10: bu kadar ardışık başarısız tikte Telegram (30 dk aralıkla ≈ 1,5 saat)
/** Alt süreç stderr'inden okunur hata özeti: 'Error' içeren son satır (yığın izinin "at …" satırları değil). */
function hataOzeti(metin, kod) {
  const satir = String(metin || '').trim().split('\n').map(x => x.trim()).filter(Boolean);
  const e = satir.filter(x => /Error\b|Hata/i.test(x) && !/^at /.test(x)).pop();
  return (e || satir.filter(x => !/^at /.test(x)).pop() || `çıkış kodu ${kod}`).slice(0, 500);
}
const VERI_KAYNAKLARI = ['yahoo-gercek-varlik', 'yahoo-nasdaq', 'yahoo-portfoy', 'yahoo-bist', 'usdtry', 'binance-market-db', 'kol-onbellegi'];
const ayOf = g => g.slice(0, 7);
const sonGunAy = (ay, takvim) => (takvim === 'GUN' ? T.iso(Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7), 1) - T.GUN) : T.iso(T.aySonuIslemGunu(ay, takvim)));

function kayitDizini(makine) {
  return makine === 'ev' ? path.join(PROJE, 'kayitlar', 'model-portfoy') : DF.yol('disari', 'model-portfoy');
}

/** Bir modelin dondurulmuş karar listesinden emir taslağı satırı. */
function emirSatiri(k) {
  if (k.model === 'm-837') return { kararGunu: k.kararGunu, uygulamaGunu: k.uygulamaGunu, tur: k.tur2 || 'yerlesim', hedef: Object.entries(k.agirlik).map(([kol, w]) => ({ kol, agirlik: w })) };
  return { kararGunu: k.kararGunu, uygulamaGunu: k.uygulamaGunu, hedef: Object.entries(k.agirlik).map(([s, w]) => ({ s, agirlik: w })), eksikVeri: k.eksikVeri || [] };
}
function emirTaslaklari(kararlar, etiket) {
  const aylar = new Map();
  for (const k of kararlar) {
    if (!MD.MODELLER.includes(k.model) || k.tur2 === 'dengeleme') continue;
    const ay = ayOf(k.uygulamaGunu);
    if (!aylar.has(ay)) aylar.set(ay, {});
    aylar.get(ay)[k.model] = emirSatiri(k);
  }
  const out = [];
  for (const [ay, modeller] of aylar) {
    out.push([ay, { surum: 1, ay, durum: 'taslak', not: 'Model portföyün bu ayki hedef listesi. Gerçek emir tablosu (Portföyüm pozisyonu → hedef, adet, tutar) F4\'te doldurulacak.',
      makine: etiket.makine, ...(etiket.deneme ? { deneme: true } : {}), modeller }]);
  }
  return out;
}

/** Tamamlanan aylar için aylık dışa aktarım (yalnız endeks; tutar yok). Var olan dosyaya dokunulmaz. */
function aylikDisari(gunluk, kararlar, { dizin, etiket, simdi }) {
  const yazilan = [];
  const seriSatir = new Map(MD.SIRA.map(id => [id, gunluk.filter(s => s.model === id)]));
  const ilkAy = ayOf(MD.BASLANGIC);
  const sonlar = MD.SIRA.map(id => { const s = seriSatir.get(id); return s.length ? s[s.length - 1].gun : null; });
  if (sonlar.some(x => !x)) return yazilan;
  const enKucuk = sonlar.sort()[0];
  let onceki = null;
  for (let ay = ilkAy; ay <= ayOf(enKucuk); ay = ayOf(T.iso(Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7), 1)))) {
    const tam = MD.SIRA.every(id => { const s = seriSatir.get(id); return s[s.length - 1].gun >= sonGunAy(ay, MD.SERI[id].takvim); });
    const p = path.join(dizin, `${ay}.json`);
    if (!tam) break;
    if (fs.existsSync(p)) { try { onceki = JSON.parse(fs.readFileSync(p, 'utf8')).sha; } catch (e) { onceki = null; } continue; }
    const seriler = {};
    for (const id of MD.SIRA) {
      const s = seriSatir.get(id).filter(x => ayOf(x.gun) === ay);
      const onc = seriSatir.get(id).filter(x => x.gun < ay + '-01').pop();
      const bas = onc ? onc.endeks : 100, son = s.length ? s[s.length - 1].endeks : bas;
      const o = { tur: MD.SERI[id].tur, takvim: MD.SERI[id].takvim, gunler: s.map(x => [x.gun, x.endeks]), ayGetiri: MD.R(son / bas - 1), satirSha: s.length ? s[s.length - 1].sha : null };
      if (id === 'm-837') {
        o.kollar = s.map(x => [x.gun, x.kollar.cekirdek, x.kollar.uydu]);
        o.kolGetiri = { cekirdek: MD.R(zincirGetiri(s, onc, 'cekirdek')), uydu: MD.R(zincirGetiri(s, onc, 'uydu')), not: 'kolun ay içi getirisi (günlük oranlar zinciri; ay sonu aktarımı ve maliyeti hariç — dengeleme günü dengeleme öncesi değer)' };
      }
      if (id === 'm-bist-m10' || id === 'k-xu030' || id === 'k-ew-bist30') o.gunlerTl = s.map(x => [x.gun, x.endeksTl]);
      seriler[id] = o;
    }
    const listeler = kararlar.filter(k => ayOf(k.kararGunu) === ay || (k.ilk && ay === ilkAy)).map(k => ({ model: k.model, kararGunu: k.kararGunu, uygulamaGunu: k.uygulamaGunu, liste: (k.liste || []).map(x => x.s), agirlik: k.liste ? undefined : k.agirlik, girdiImza: k.girdiImza }));
    const govde = { surum: 1, ay, kaynak: MD.sabYolu() + ' (sabitleme), lib/tasarimci/model.js', not: 'Yalnız 100 tabanlı endeks (USD; BIST için ayrıca TL). Gerçek tutar bu dosyada YOK (K6, T2).',
      uretim: new Date(simdi).toISOString(), makine: etiket.makine, ...(etiket.deneme ? { deneme: true } : {}), seriler, kararlar: listeler, onceki };
    const kayit = { ...govde, sha: DF.sha(govde) };
    DF.atomikYaz(p, JSON.stringify(kayit, null, 1) + '\n');
    yazilan.push(p); onceki = kayit.sha;
  }
  return yazilan;
}
function zincirGetiri(s, onc, kol) {
  let L = 1, p = onc ? onc.kollar[kol] : 50;
  for (const x of s) { L *= (x.kollarOnce || x.kollar)[kol] / p; p = x.kollar[kol]; }
  return L - 1;
}

const durumYaz = d => DF.jsonYaz('durum.json', d);

async function tik(ops = {}) {
  if (process.env.TASARIMCI === '0' && !ops.zorla) return { kapali: true, neden: 'TASARIMCI=0' };
  const simdi = ops.simdi != null ? ops.simdi : Date.now();
  const log = ops.log || (() => {});
  const makine = DF.makine(), etiket = { makine, ...(makine === 'gelistirme' ? { deneme: true } : {}) };
  return DF.kilitle(async () => {
    const t0 = Date.now(), bugun = T.iso(simdi), uyarilar = [], eklenen = { kararlar: 0, gunluk: 0, dolumlar: 0, emirler: [], disari: [] };
    // 1. Üyelik anlık görüntüsü
    let uyelik = null;
    if (ops.uyelikAl !== false) {
      try {
        const UY = require('./uyelik');
        const r = await UY.anlikGoruntuAl(bugun.slice(0, 7), { simdi, makine, ...(ops.fetch ? { fetch: ops.fetch } : {}) });
        uyelik = { ay: bugun.slice(0, 7), durum: r.durum, uyari: r.uyari || null };
        if (r.durum === 'hata') uyarilar.push(r.uyari);
      } catch (e) { uyelik = { durum: 'hata', uyari: e.message }; uyarilar.push(`Nasdaq-100 üyelik görüntüsü: ${e.message}`); }
    }
    // 2. Seriler
    const P = MD.piyasaKur({ simdi, ...(ops.piyasa || {}) });
    let kararlar = DF.oku('kararlar').satirlar, gunluk = DF.oku('gunluk').satirlar;
    if (makine === 'ev') {
      const kirliMi = x => x.deneme || x.makine === 'gelistirme';
      const kirli = [['kararlar', kararlar], ['dolumlar', DF.oku('dolumlar').satirlar], ['gunluk', gunluk]].map(([ad, l]) => [ad, l.filter(kirliMi).length]).filter(([, n]) => n);
      if (kirli.length) {
        const neden = `RESMİ SERİ KORUNDU: bu makine sunucu (resmî seri) ama ${DF.dizin()} içinde geliştirme makinesinin deneme kayıtları var (${kirli.map(([a, n]) => `${a} ${n}`).join(', ')}) — geliştirme kopyası taşınmış olabilir. Tik hiçbir şey yazmadı. Düzeltme: bu dizindeki kararlar/dolumlar/gunluk.jsonl ve emirler/ dosyalarını yedekleyip kaldırın (resmî seri 2026-10-12'den kendiliğinden yeniden dolar).`;
        const d = { surum: 1, guncelleme: new Date(simdi).toISOString(), makine, bugun, reddedildi: true, neden, uyarilar: [neden, ...uyarilar] };
        durumYaz(d); log('ERROR', `🧭 ${neden}`);
        return d;
      }
    }
    const seriDurum = {};
    for (const id of MD.SIRA) {
      const satirlar = gunluk.filter(s => s.model === id);
      let r;
      try { r = MD.ilerlet(id, { P, satirlar, kararlar, bugun, simdi, etiket }); }
      catch (e) { r = { satirlar: [], kararlar: [], dolumlar: [], veriNotu: `${id}: HATA ${e.message}`, uyarilar: [], notlar: [] }; log('WARN', `🧭 Tasarımcı ${id}: ${e.stack || e.message}`); }
      if (r.kararlar.length) { eklenen.kararlar += DF.ekle('kararlar', r.kararlar, { anahtar: MD.kararAnahtar }).eklenen.length; kararlar = kararlar.concat(r.kararlar); }
      if (r.dolumlar.length) eklenen.dolumlar += DF.ekle('dolumlar', r.dolumlar, { anahtar: d => `${d.model}|${d.gun}|${d.s}|${d.yon}` }).eklenen.length;
      if (r.satirlar.length) { eklenen.gunluk += DF.ekle('gunluk', r.satirlar, { anahtar: s => `${s.model}|${s.gun}` }).eklenen.length; gunluk = gunluk.concat(r.satirlar); }
      uyarilar.push(...r.uyarilar);
      const tum = satirlar.concat(r.satirlar), son = tum[tum.length - 1];
      seriDurum[id] = { sonGun: son ? son.gun : null, sonEndeks: son ? son.endeks : 100, satir: tum.length, veriNotu: r.veriNotu, notlar: r.notlar.slice(-5) };
    }
    // 2b. Kâğıt hesaplar (61.4, lib/tasarimci/kagit.js): sermayeyle tam adet al-sat, komisyon, temettü — model satırlarından sonra
    let kagitOzet = null;
    try {
      const KG = require('./kagit');
      const kg = KG.tikHesapla({ DF, V: require('./veri'), T, kararlar, gunluk, dolumlar: DF.oku('dolumlar').satirlar, bugun, simdi });
      kagitOzet = Object.fromEntries(Object.entries(kg.modeller).map(([id, x]) => [id, x.ozet && !x.ozet.bos ? { son: x.ozet.son, ozsermaye: x.ozet.ozsermaye, islem: x.ozet.islemSayisi } : null]));
      uyarilar.push(...kg.uyarilar);
      // Telegram: alım-satım olan her yeni gün için özet — YALNIZ sunucu (ops.bildir test için enjekte edilir)
      if (makine === 'ev' || ops.bildir) {
        const kb = DF.jsonOku('kagit-bildirim.json') || { son: {} };
        const b = KG.bildirimler(kg, kb.son);
        const gonder = ops.bildir || require('../telegramDosya').telegramDosyadan();
        for (const m of b.mesajlar) { try { await gonder('lifecycle', m.baslik, m.satirlar); } catch (e) { uyarilar.push(`kâğıt hesap Telegram: ${e.message}`); } }
        if (JSON.stringify(b.yeniSon) !== JSON.stringify(kb.son)) DF.jsonYaz('kagit-bildirim.json', { son: b.yeniSon, guncelleme: new Date(simdi).toISOString() });
      }
    } catch (e) { uyarilar.push(`kâğıt hesaplar: ${e.message}`); log('WARN', `🧭 Kâğıt hesap: ${e.stack || e.message}`); }
    // 2c. Aday havuzu (62.3, lib/tasarimci/adayHavuzu.js): sıradaki ay sonu kararının bugünkü veriyle önizlemesi — yalnız bilgi
    try {
      const AH = require('./adayHavuzu').hesapla({ P, kararlar, bugun, simdi });
      for (const [id, x] of Object.entries(AH.modeller)) if (x && x.hata) uyarilar.push(`aday havuzu ${id}: ${x.hata}`);
      DF.jsonYaz('aday-havuzu.json', AH);
    } catch (e) { uyarilar.push(`aday havuzu: ${e.message}`); }
    // 3. Emir taslakları (içerik aynıysa yazılmaz → bayt bayt idempotent)
    for (const [ay, icerik] of emirTaslaklari(kararlar, etiket)) {
      const rel = path.join('emirler', `${ay}.json`), eski = DF.jsonOku(rel);
      if (!eski || DF.kanonik(eski.modeller) !== DF.kanonik(icerik.modeller)) { DF.jsonYaz(rel, { ...icerik, guncelleme: new Date(simdi).toISOString() }); eklenen.emirler.push(ay); }
    }
    // 4. Dondurma mutabakatı
    const mutabakat = {};
    const zincir = DF.gunlukZinciriDogrula(gunluk);
    if (!zincir.tamam) uyarilar.push(`gunluk.jsonl SHA-256 zinciri: ${zincir.hatalar.slice(0, 3).join('; ')}`);
    for (const id of MD.SIRA) {
      const satirlar = gunluk.filter(s => s.model === id);
      if (!satirlar.length) continue;
      try {
        const m = MD.yenidenOynat(id, { P, satirlar, kararlar, etiket });
        mutabakat[id] = { kontrol: m.kontrol, fark: m.fark.length, ilk: m.fark.slice(0, 3) };
        if (m.fark.length) uyarilar.push(`${id}: ${m.fark.length} günde güncel veri dondurulmuş satırdan farklı (ilk ${m.fark[0].gun}: defter ${m.fark[0].defter}, yeniden ${m.fark[0].yeniden}) — veri revizyonu; satırlar DEĞİŞMEDİ`);
      } catch (e) { mutabakat[id] = { hata: e.message }; }
    }
    // 5. Aylık dışa aktarım
    try { eklenen.disari = aylikDisari(gunluk, kararlar, { dizin: ops.kayitDizini || kayitDizini(makine), etiket, simdi }); }
    catch (e) { uyarilar.push(`aylık dışa aktarım: ${e.message}`); }
    // 6. Durum
    const sonraki = { NYSE: T.sonrakiKararlar(1, 'NYSE', { simdi })[0], BIST: T.sonrakiKararlar(1, 'BIST', { simdi })[0] };
    const durum = { surum: 1, guncelleme: new Date(simdi).toISOString(), makine, ...(etiket.deneme ? { deneme: true } : {}), bugun, sureSn: (Date.now() - t0) / 1000,
      eklenen, seriler: seriDurum, kagit: kagitOzet, uyarilar: [...new Set(uyarilar.filter(Boolean))], mutabakat, zincir: zincir.tamam, uyelik, sonrakiKarar: sonraki };
    durumYaz(durum);
    log(uyarilar.length ? 'WARN' : 'INFO', `🧭 Tasarımcı tik: +${eklenen.kararlar} karar, +${eklenen.gunluk} gün, +${eklenen.dolumlar} dolum${uyarilar.length ? `, ${uyarilar.length} uyarı` : ''}`);
    return durum;
  });
}

/** Sunucu zamanlayıcısı: veri talebi (süreç içi) + tik ALT SÜREÇTE. */
/**
 * @param alarm (baslik, satirlar) → void — O10 (62.0): tik ALARM_ESIK kez üst üste başarısız olursa (hata / zaman aşımı /
 *        reddedildi) bir kez çağrılır; başarılı tikten sonra yeniden kurulur. Server: portfoyBildirici (yalnız ev; 6 sa kısıt).
 */
function kur({ log = () => {}, veriOrk = null, betik = path.join(PROJE, 'scripts', 'tasarimci-tik.js'), env = {}, zamanAsimiMs = ZAMAN_ASIMI_MS, alarm = null } = {}) {
  let cocuk = null, zaman = null, ilk = null, son = null;
  let ardisikHata = 0, alarmGitti = false;
  function sonucIsle(s) {
    if (!s || !s.hata) { if (alarmGitti && typeof alarm === 'function') { try { alarm('Portföy tasarımcısı yeniden çalışıyor', [`${ardisikHata} başarısız denemeden sonra tik başarılı.`]); } catch { /* */ } } ardisikHata = 0; alarmGitti = false; return; }
    ardisikHata++;
    if (ardisikHata >= ALARM_ESIK && !alarmGitti && typeof alarm === 'function') {
      alarmGitti = true;
      try { alarm('Portföy tasarımcısı çalışmıyor', [`${ardisikHata} denemedir başarısız (yaklaşık ${Math.round(ardisikHata * ARALIK_MS / 3600e3 * 10) / 10} saat): ${String(s.hata).slice(0, 300)}`, 'Bu ay emir listesi ve kâğıt hesaplar güncellenmiyor. Panel › Portföy › Model izleme ve Aktivite günlüğüne bakın.']); } catch { /* bildirim hatası tiki etkilemez */ }
    }
  }
  /** Zaman aşımı: durum.json'a açık uyarı (tik yazamadan öldürüldü). */
  function asimYaz(bilgi) {
    try { const d = DF.jsonOku('durum.json') || {}; DF.jsonYaz('durum.json', { ...d, zamanAsimi: bilgi, uyarilar: [...(d.uyarilar || []).filter(u => !/zaman aşımı|bitmedi/.test(u)), bilgi.mesaj] }); } catch (e) { /* yazılamadı — log yeter */ }
  }
  function tetikle(neden = 'zamanlayıcı') {
    if (cocuk) return { baslatildi: false, calisiyor: true };
    let veriNotu = null;
    try { if (veriOrk && veriOrk.talep) veriNotu = veriOrk.talep(VERI_KAYNAKLARI, { neden: 'tasarımcı' }).veriNotu; } catch (e) { veriNotu = e.message; }
    const { spawn } = require('child_process');
    const bas = Date.now();
    cocuk = spawn(process.execPath, [betik, '--json'], { cwd: PROJE, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let cikti = '', hata = '', asildi = false;
    const bekci = setTimeout(() => {
      if (!cocuk) return;
      asildi = true;
      const mesaj = `tasarımcı tik ${Math.round(zamanAsimiMs / 60e3) || '<1'} dk içinde bitmedi — alt süreç öldürüldü (${new Date().toISOString()}); sonraki tik yeniden dener`;
      log('WARN', `🧭 ${mesaj}`); asimYaz({ zaman: new Date().toISOString(), neden, mesaj });
      try { cocuk.kill(); } catch (e) { /* zaten çıktı */ }
    }, zamanAsimiMs);
    if (bekci.unref) bekci.unref();
    cocuk.stdout.on('data', d => { cikti += d; if (cikti.length > 2e6) cikti = cikti.slice(-1e6); });
    cocuk.stderr.on('data', d => { hata += d; if (hata.length > 1e5) hata = hata.slice(-5e4); });
    cocuk.on('error', e => { clearTimeout(bekci); son = { bas: new Date(bas).toISOString(), hata: e.message, neden }; cocuk = null; log('WARN', `🧭 Tasarımcı tik başlatılamadı: ${e.message}`); sonucIsle(son); });
    cocuk.on('exit', kod => {
      let ozet = null; try { ozet = JSON.parse(cikti.trim().split('\n').pop()); } catch (e) { ozet = null; }
      clearTimeout(bekci);
      son = { bas: new Date(bas).toISOString(), bit: new Date().toISOString(), kod, neden, veriNotu, ozet: ozet && { eklenen: ozet.eklenen, uyari: (ozet.uyarilar || []).length, reddedildi: !!ozet.reddedildi },
        hata: asildi ? `zaman aşımı (${zamanAsimiMs} ms) — öldürüldü` : kod ? hataOzeti(hata, kod) : (ozet && ozet.reddedildi ? ozet.neden : null) };
      cocuk = null;
      if (kod && !asildi) log('WARN', `🧭 Tasarımcı tik hatası: ${son.hata}`);
      else if (ozet && ozet.reddedildi) log('WARN', `🧭 Tasarımcı tik REDDEDİLDİ: ${ozet.neden}`);
      else if (ozet && ozet.eklenen && (ozet.eklenen.gunluk || ozet.eklenen.kararlar)) log('INFO', `🧭 Tasarımcı: +${ozet.eklenen.kararlar} karar, +${ozet.eklenen.gunluk} gün`);
      sonucIsle(son);
    });
    return { baslatildi: true, veriNotu };
  }
  return {
    tetikle,
    baslat() {
      if (process.env.TASARIMCI === '0') { log('INFO', '🧭 Tasarımcı zamanlayıcısı kapalı (TASARIMCI=0)'); return false; }
      ilk = setTimeout(() => tetikle('açılış'), ACILIS_MS); zaman = setInterval(() => tetikle('30 dk'), ARALIK_MS);
      if (ilk.unref) ilk.unref(); if (zaman.unref) zaman.unref();
      return true;
    },
    durdur() { clearTimeout(ilk); clearInterval(zaman); },
    durum: () => ({ etkin: !!zaman, calisiyor: !!cocuk, son, aralikDk: ARALIK_MS / 60e3 }),
  };
}

module.exports = { tik, kur, emirTaslaklari, aylikDisari, kayitDizini, hataOzeti, VERI_KAYNAKLARI, ARALIK_MS, ZAMAN_ASIMI_MS };
