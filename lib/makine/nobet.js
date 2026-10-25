'use strict';
/**
 * NÖBET (75.5, 3. faz parça 3c — TASARIM-MAKINE-HESAP-BOT §4.4 "Nöbet kuralı", §11 kararları) — SAF kurallar.
 * ═══════════════════════════════════════════════════════════════════════════
 * Bir bot (bot kaydındaki kimlik) aynı anda YALNIZ BİR makinede çalışır. Bot kaydının iki alanı (2. fazdan beri var, 3c'de anlam kazandı):
 *   · `makine` — botun sahibi olan makinenin kimliği (m-…); null = "bu kaydın bulunduğu makine" (taşıma öncesi bütün kayıtlar).
 *   · `nobet`  — her taşımada bir artan tam sayı (0 = hiç taşınmadı). Büyük nöbet küçüğü yener: eski bir kopya kendini sahip sanmaz.
 *
 * KURALLAR
 *   1. YEREL KURAL (ağ gerekmez, her yerde): kaydın `makine` alanı başka bir makineyi gösteriyorsa ya da bu makinede bot için bir taşıma
 *      sürüyorsa (`tasiniyor`) bot BAŞLAMAZ, borsaya BAĞLANMAZ, emir göndermez (açılış, Başlat, Çalıştır, Mutabakat, Acil, Kuru — hepsi).
 *   2. AÇILIŞ (yalnız eşlenmiş SUNUCU varken; geliştirme bilgisayarı bot çalıştırmaz, sayılmaz): çalışması gereken her bot için
 *      ulaşılabilen sunucu eşlerinden o botun nöbeti sorulur (GET /api/makine/kimlik — nabız özetindeki botlar).
 *        · Bir eşte nöbet benimkinden BÜYÜK → bot başlamaz, kayıt o eşe devredilir (makine = eş, nöbet = eşinki), haber.
 *        · Aynı nöbet ve eş o botu demo/canlıda ÇALIŞTIRIYOR, benimki de demo/canlı → ÇAKIŞMA: başlamaz, alarm (iki makine aynı
 *          kimlikle — aynı emir öneki bd<2 harf> — aynı hesaba emir göndermesin).
 *        · Hiçbir sunucu eşine ulaşılamadı → başlamaz ("eşlere ulaşılamadı — elle Başlat"; §11 kapalı-başarısız kararı).
 *        · Eş yok → bugünkü davranış (başlar).
 *   3. ELLE BAŞLAT / ÇALIŞTIR (eş varken taze yoklama): yalnız OLUMLU çakışma reddedilir (eşte büyük nöbet ya da eşte demo/canlıda çalışan
 *      aynı bot); ulaşılamayan eş engellemez — elle Başlat kapalı-başarısız açılışın çıkış yoludur.
 *   4. KAIROS DEMO KORUMASI (TASARIM §0.2, 2026-12-09 21:00 UTC'ye kadar): Kairos (hucum) demo modunda açılış kuralı yalnız HABER olur
 *      (bot yine başlar) — demo kabulü kesintisiz sürsün. Kairos bu tarihe kadar taşınamadığı için başka makinede sahibi olamaz.
 *
 * BÖLÜNMÜŞ BEYİN (iki makine birbirini görmüyor): taşınmış bir botun eski makinesi YEREL KURAL'la hiç başlamaz (ağ gerekmez). Eski
 *   yedekten açılan (kaydı makine = null, nöbet 0) makine eşlerine ulaşamazsa başlamaz (kural 2). Eş kaydı da kaybolmuşsa ikinci savunma
 *   borsa mutabakatıdır: defterinde olmayan bizim önekli emir/pozisyon ENGEL'dir (lib/live/yurutucu — mevcut davranış).
 */
const { KORUMA_BITIS } = require('../live/veriKalitesi');
const { KIMLIK_RE } = require('./protokol');

const KAIROS = 'hucum';

/** Saf: Kairos demo kabulü koruması altında mı (Kairos + demo + 2026-12-09 21:00 UTC öncesi). */
function korumaliMi(bot, simdi = Date.now()) {
  return !!bot && bot.kimlik === KAIROS && bot.mod === 'demo' && simdi < KORUMA_BITIS;
}

/**
 * Saf: bu bot BU makineden taşınabilir mi → null | { kod, metin }.
 * @param b { kimlik, motor ('bindirme'|'model'), mod, demoDizinDolu (Kairos'un hucum-demo dizininde veri var mı), calismaSuruyor }
 */
function tasinabilirMi(b, simdi = Date.now()) {
  if (!b || !b.kimlik) return { kod: 'bot-yok', metin: 'bilinmeyen bot' };
  if (b.motor === 'model') return { kod: 'model', metin: 'model örnekleri (Nova / Lydia / Simurg kâğıt hesabı) bu sürümde taşınmaz — yalnız bindirme botları (Kairos tipi, Tao tipi)' };
  if (b.motor !== 'bindirme') return { kod: 'motor', metin: `bu bot türü taşınamaz (${b.motor || '?'})` };
  if (b.mod === 'canli') return { kod: 'canli', metin: 'GERÇEK PARA botu taşınamaz — önce kâğıt ya da demo moduna alın (gerçek parada taşıma bu planda yok)' };
  if (b.kimlik === KAIROS && simdi < KORUMA_BITIS && (b.mod === 'demo' || b.demoDizinDolu)) {
    return { kod: 'kairos-demo', metin: 'Kairos demo kabulü 2026-12-09\'a kadar sürüyor — Kairos (ve demo kabul klasörü hucum-demo) bu tarihe kadar başka makineye taşınmaz' };
  }
  if (!['kagit', 'demo'].includes(b.mod)) return { kod: 'mod', metin: `mod "${b.mod}" taşınamaz` };
  return null;
}

/**
 * Saf: YEREL KURAL — ağ gerekmez. @param kayit bot kaydı (makine, nobet) · @param tasima bu makinedeki taşıma durumu (asama) · @param ben makine kimliği
 * @returns null | { kod: 'tasiniyor' | 'baska-makinede', metin, makine, nobet }
 */
function yerelEngel({ kayit, tasima, ben, esAd } = {}) {
  if (tasima && tasima.asama === 'tasiniyor') {
    return { kod: 'tasiniyor', metin: `bu bot şu an ${esAd || tasima.hedef || 'başka makine'}'ye taşınıyor${tasima.belirsiz ? ' — sonuç henüz belli değil (hedefe ulaşılamadı)' : ''}; taşıma bitene ya da geri alınana kadar burada başlamaz, borsaya bağlanmaz`, makine: tasima.hedef || null, nobet: tasima.nobet };
  }
  const m = kayit && kayit.makine;
  if (m && KIMLIK_RE.test(String(m)) && m !== ben) {
    return { kod: 'baska-makinede', metin: `bu bot ${esAd || m} makinesine taşındı (nöbet ${Number(kayit.nobet) || 0}) — orada çalışır; buradaki kopya eski ve salt okunur. Geri getirmek için o makineden bu bilgisayara taşıyın`, makine: m, nobet: Number(kayit.nobet) || 0 };
  }
  return null;
}

/** Saf: bir eşin yanıtındaki aynı kimlikli bot (yoksa null). */
function esBotu(yanit, kimlik) {
  const l = yanit && Array.isArray(yanit.botlar) ? yanit.botlar : [];
  return l.find(x => x && x.kimlik === kimlik) || null;
}

/**
 * Saf: eş yanıtlarına göre ÇAKIŞMA var mı (açılış ve elle Başlat ortak) → null | { kod: 'devredildi'|'cakisma', es, metin, devret }.
 * @param bot { kimlik, mod, nobet } · @param yanitlar [{ kimlik (eş), ad, ok, ozet }]
 */
function esCakismasi(bot, yanitlar) {
  const n = Number(bot.nobet) || 0;
  for (const y of yanitlar || []) {
    if (!y || !y.ok) continue;
    const x = esBotu(y.ozet, bot.kimlik);
    if (!x) continue;
    const en = Number(x.nobet) || 0;
    if (en > n) {
      const sahip = x.makine && KIMLIK_RE.test(String(x.makine)) ? x.makine : y.kimlik;
      return { kod: 'devredildi', es: y.kimlik, metin: `${y.ad || y.kimlik} bu botun daha yeni nöbetini taşıyor (nöbet ${en} > buradaki ${n}) — bot oraya taşınmış; burada başlamaz`, devret: { makine: sahip, nobet: en } };
    }
    if (en === n && x.calisiyor && x.mod && x.mod !== 'kagit' && bot.mod && bot.mod !== 'kagit') {
      return { kod: 'cakisma', es: y.kimlik, metin: `${y.ad || y.kimlik} aynı botu (${bot.kimlik}) ${x.mod === 'demo' ? 'demo' : 'gerçek para'} modunda ÇALIŞTIRIYOR — iki makine aynı kimlikle (aynı emir öneki) emir göndermesin diye burada başlamaz`, devret: null };
    }
  }
  return null;
}

/**
 * Saf: AÇILIŞ kararı (kural 2 + 4). Yerel kural ayrıca (önce) uygulanır.
 * @param o.bot        { kimlik, mod, nobet }
 * @param o.esSayisi   kayıtlı SUNUCU eşi sayısı
 * @param o.yanitlar   [{ kimlik, ad, ok, ozet, hata }] — o an sorulan sunucu eşleri
 * @returns {{ basla, kod, metin, devret, haber }}  haber = koruma altındaki bot engellenmedi, yalnız bildirildi
 */
function acilisKarar({ bot, esSayisi, yanitlar, simdi = Date.now() }) {
  if (!esSayisi) return { basla: true, kod: 'es-yok', metin: 'eşlenmiş sunucu yok — bugünkü davranış', devret: null, haber: false };
  const c = esCakismasi(bot, yanitlar);
  let r;
  if (c) r = { basla: false, kod: c.kod, metin: c.metin, devret: c.devret, haber: false };
  else if (!(yanitlar || []).some(y => y && y.ok)) r = { basla: false, kod: 'eslere-ulasilamadi', metin: `eşlenmiş ${esSayisi} sunucunun hiçbirine ulaşılamadı — botun başka makinede çalışmadığı doğrulanamadı; bot kendiliğinden başlamadı (elle Başlat ile açabilirsiniz)`, devret: null, haber: false };
  else return { basla: true, kod: 'temiz', metin: 'eşler denetlendi — çakışma yok', devret: null, haber: false };
  if (korumaliMi(bot, simdi)) return { ...r, basla: true, devret: null, haber: true, metin: `${r.metin} — Kairos demo kabulü süresince yalnız haber (bot başladı)` };
  return r;
}

/** Saf: ELLE Başlat / Çalıştır kararı (kural 3): yalnız olumlu çakışma reddedilir. → null | { kod, metin, devret } */
function baslatKarar({ bot, yanitlar, simdi = Date.now() }) {
  const c = esCakismasi(bot, yanitlar);
  if (!c) return null;
  if (korumaliMi(bot, simdi)) return null;
  return c;
}

module.exports = { korumaliMi, tasinabilirMi, yerelEngel, esBotu, esCakismasi, acilisKarar, baslatKarar, KAIROS, KORUMA_BITIS };
