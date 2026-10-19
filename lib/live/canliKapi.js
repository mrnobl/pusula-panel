'use strict';
/**
 * GERÇEK PARA KAPISI (61.8, C1 — PLAN-GERCEK-PARA-2027.md §1 G1–G9, §2 C1).
 *
 * Portföy botunun `canli` (gerçek para, Binance USDⓈ-M + çoklu varlık) kipine geçebilmesi için KODUN DENETLEDİĞİ şartlar.
 * Saf işlev: dosya/ağ okumaz; server.js girdileri verir. HER şart sağlanmadıkça:
 *   · panelde "gerçek para" seçeneği görünmez (uç `modlar` listesine eklenmez),
 *   · mod değiştirme, bağlanma ve başlatma reddedilir (açılışta da).
 *
 * Kod şunları denetler (sırayla, hepsi raporlanır — ilk eksikte durmaz):
 *   K-TARIH  bugün ≥ 2027-01-05 (G3 kontrol noktası; şartlar gevşetilmez)
 *   K-ONAY   kullanıcının yazılı G1–G9 onayı (`data/live/canli-kapilar.json`, `npm run canli-kapilar`) — her biri
 *            true + tarih; G3 onayı 2027-01-05'ten önce verilmiş olamaz
 *   K-SERMAYE canlı sermaye tavanı > 0 ve ≤ onay dosyasındaki üst sınır (G9) ve ≤ MUTLAK_UST (Ö5: ilk 1000 $; artırma
 *            onay dosyasında yeni üst sınırla)
 *   K-ANAHTAR gerçek hesap API anahtarı tanımlı (izinler bağlanırken borsadan ayrıca denetlenir: çekme KAPALI, futures,
 *            spot, universal transfer, IP kısıtı — lib/live/yurutucu.js baglan)
 *   K-SAGLIK healthchecks bot URL'si tanımlı (gerçek parada sessiz kalma yok — denetim O5)
 *   K-TEK    başka bir portföy botu gerçek parada değil (hesap başına tek bot — çoklu varlık kalıntı/beklenen BTC karışır)
 *   K-MOD    araştırma modu (geliştirme bilgisayarı) değil
 */
const CANLI_EN_ERKEN = '2027-01-05';
const SARTLAR = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'];
const MUTLAK_UST = 1000;   // Ö5 ilk sermaye üst sınırı; onay dosyası `sermayeUstSinir` ile (her adım en çok ×2) yükseltilir

const gun = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * @param o.simdi         ms
 * @param o.ad            'hucum' | 'denge'
 * @param o.tavan         canlı sermaye tavanı (USDT) — config.bindirme.<ad>.canliSermayeTavani
 * @param o.kapilar       data/live/canli-kapilar.json içeriği | null
 * @param o.anahtarVar    config.apiKey && config.apiSecret
 * @param o.saglikUrl     config.healthchecksUrl
 * @param o.digerCanli    gerçek parada olan diğer bot adları
 * @param o.arastirma     ARASTIRMA_MODU
 * @returns {{ izin: boolean, eksikler: {kod, metin}[], ustSinir: number|null }}
 */
function denetle(o) {
  const eksikler = [];
  const ekle = (kod, metin) => eksikler.push({ kod, metin });
  const bugun = gun(o.simdi);
  if (o.arastirma) ekle('K-MOD', 'bu bilgisayar araştırma modunda (gerçek para yalnız sunucuda)');
  if (bugun < CANLI_EN_ERKEN) ekle('K-TARIH', `gerçek para en erken ${CANLI_EN_ERKEN} (G3: 90 günlük ileri test kontrol noktası) — bugün ${bugun}`);

  const k = o.kapilar && typeof o.kapilar === 'object' ? o.kapilar : null;
  let ustSinir = null;
  if (!k) ekle('K-ONAY', 'G1–G9 yazılı onayı yok (sunucuda: npm run canli-kapilar)');
  else {
    const onaylar = k.onaylar || {};
    const eksikG = SARTLAR.filter(g => !(onaylar[g] && onaylar[g].onay === true && /^\d{4}-\d{2}-\d{2}$/.test(String(onaylar[g].tarih || ''))));
    if (eksikG.length) ekle('K-ONAY', `onaylanmamış şart: ${eksikG.join(', ')}`);
    const g3 = onaylar.G3;
    if (g3 && g3.tarih && g3.tarih < CANLI_EN_ERKEN) ekle('K-ONAY', `G3 onayı ${g3.tarih} tarihli — ${CANLI_EN_ERKEN}'ten önce verilemez`);
    ustSinir = Number.isFinite(+k.sermayeUstSinir) && +k.sermayeUstSinir > 0 ? +k.sermayeUstSinir : null;
    if (ustSinir == null) ekle('K-ONAY', 'onay dosyasında sermaye üst sınırı (G9) yok');
  }
  const tavan = +o.tavan;
  if (!(tavan > 0)) ekle('K-SERMAYE', 'canlı sermaye tavanı tanımlı değil (config.bindirme.<ad>.canliSermayeTavani)');
  else {
    if (ustSinir != null && tavan > ustSinir) ekle('K-SERMAYE', `canlı sermaye tavanı ${tavan} > onaylı üst sınır ${ustSinir} (G9)`);
    if (tavan > MUTLAK_UST && !(ustSinir != null && ustSinir >= tavan && k && k.artirmaGerekcesi)) ekle('K-SERMAYE', `ilk sermaye en çok ${MUTLAK_UST} $ (Ö5); üstü için onay dosyasında artırma gerekçesi gerekir`);
    // Denetim #8: artırma geçmişi olmadan (doğrudan) 1000 $ üstü sınır kabul edilmez; her adım en çok ×2.
    if (ustSinir != null && ustSinir > MUTLAK_UST) {
      const adimlar = ((k && k.gecmis) || []).filter(g => g && g.islem === 'ust-sinir').map(g => +g.deger).filter(x => x > 0);
      let onceki = 0, gecerli = adimlar.length > 0;
      for (const a of adimlar) { if (onceki === 0 ? a > MUTLAK_UST : a > 2 * onceki) gecerli = false; onceki = a; }
      if (!gecerli || onceki !== ustSinir) ekle('K-SERMAYE', `üst sınır ${ustSinir} $ geçerli artırma adımlarıyla (ilk ≤ ${MUTLAK_UST}, her adım ≤ ×2) yazılmamış`);
    }
  }
  if (!o.anahtarVar) ekle('K-ANAHTAR', 'gerçek hesap API anahtarı yok (Borsa › API anahtarları › Live)');
  if (!o.saglikUrl) ekle('K-SAGLIK', 'healthchecks bot adresi yok (Ayarlar › Sağlık sinyali) — gerçek parada zorunlu');
  const diger = (o.digerCanli || []).filter(x => x && x !== o.ad);
  if (diger.length) ekle('K-TEK', `başka bot gerçek parada: ${diger.join(', ')} (hesap başına tek bot)`);
  return { izin: eksikler.length === 0, eksikler, ustSinir };
}

/** Hata metni (uçlar ve açılış). */
function metin(sonuc) {
  return `gerçek para kapısı kapalı — ${sonuc.eksikler.map(e => e.metin).join(' · ')}`;
}

module.exports = { denetle, metin, CANLI_EN_ERKEN, SARTLAR, MUTLAK_UST };
