'use strict';
/**
 * BOT FABRİKASI (74.4, A1 + 2. faz parça 2a — TASARIM-MAKINE-HESAP-BOT §2.5 kanıt (a); C1 bölmesinin ilk parçası)
 * ═══════════════════════════════════════════════════════════════════════════
 * server.js `bindirmeKur`'un SAF argüman üretimi: ayar (bindirmeAyar biçimi) ya da bot kaydı → CanliYurutucu ve BindirmeBot'a
 * verilecek ayar nesneleri. Davranış eskisiyle BİREBİR (scripts/bot-kayit-selftest.js eski kodun metniyle derin eşitliği denetler).
 * Yan etkili parçalar (günlük, bildirici, sağlık sinyali, veri kalitesi kapısı, gerçek para kapısı) `ortam`dan gelir:
 *   ortam = { dizin(ad, mod), log(seviye, metin), bildirici, golgeDosya, saglik(ad), veriKapisi({ dizin, kaydet }), kapiFn(ad) }
 * Kairos/Tao'da strateji = kimlik → bot ayarına `strateji` alanı HİÇ eklenmez (eski nesneyle bit bit aynı).
 */
const bindirmeArastirma = require('../research/bindirme');
const botKayit = require('../botKayit');

const MODLAR = ['kagit', 'demo', 'canli'];

/** BTC ayağı biçimi: demo → perp (her zaman); kâğıt → 'spot', yalnız ayar btcAyak 'coklu' ise çoklu varlık taklidi; canlı → çoklu. */
function btcAyakSec(a, mod, ad, log = () => {}) {
  if (mod === 'canli') return 'coklu';   // gerçek tasarım: spot BTC vadeli teminat (PLAN-GERCEK-PARA-2027 §0)
  if (mod === 'demo') {
    if (a.btcAyak === 'coklu') log('WARN', `[BİNDİRME] ${ad}: btcAyak 'coklu' demo'da kullanılamaz (Binance Demo'da sapi aktarımı yok) — perp`);
    return 'perp';
  }
  return a.btcAyak === 'coklu' ? 'coklu' : 'spot';
}

/**
 * Ayar nesnesinden (eski bindirmeAyar biçimi) argümanlar.
 * @param a      bindirmeAyar(ad) çıktısı
 * @param ad     iç ad (kimlik; dizin, emir öneki, gölge satırı)
 * @param mod    kagit | demo | canli
 * @param ortam  bkz. dosya başı
 * @param o.strateji  STRATEJILER anahtarı (verilmezse ad) — ad'dan farklıysa bot ayarına yazılır
 */
function argumanlarAyardan(a, ad, mod, ortam, o = {}) {
  if (!MODLAR.includes(mod)) throw new Error(`mod kagit | demo | canli olmalı ("${mod}")`);
  const strateji = o.strateji || ad;
  const tanim = bindirmeArastirma.STRATEJILER[strateji];
  if (!tanim) throw new Error(`bilinmeyen strateji: ${strateji}`);
  // 74.5: kullanıcının oluşturduğu bot (o.yeniBot) — CANLI YOK (5. faza kadar yalnız mevcut botlar); görünen ad kayıttan.
  const yeniBot = !!o.yeniBot;
  if (yeniBot && mod === 'canli') throw new Error(YENI_CANLI_RED);
  const dizin = ortam.dizin(ad, mod);
  const canliMi = mod === 'canli';
  const etiket = (yeniBot && o.adGorunen ? String(o.adGorunen) : tanim.ad).toLocaleUpperCase('tr-TR') + (mod === 'demo' ? '·DEMO' : '');
  const kaydet = (seviye, metin) => ortam.log(seviye, `[${etiket}] ${metin}`);
  const tavan = mod === 'demo' ? a.demoSermayeTavani : canliMi ? (+a.canliSermayeTavani || 0) : a.sermayeTavani;
  // Kol ×3: sembol başı nominal özsermayenin 1,8 katına çıkabilir → tavanlar 3 × sermaye tavanı.
  const btcAyak = btcAyakSec(a, mod, ad, ortam.log);
  const yurutucu = { dizin, maxEmirNominal: 3 * tavan, maxPozisyonNominal: 3 * tavan, cokluVarlik: btcAyak === 'coklu', kaydet: (s, m) => kaydet(s, `borsa: ${m}`) };
  const bot = { ad, ...(strateji !== ad ? { strateji } : {}), dizin, sermayeTavani: tavan, evren: { k: a.k }, kaydet, mod,
    btcAyak, bildirici: ortam.bildirici, golgeDosya: ortam.golgeDosya, saglik: ortam.saglik(ad),   // 68.8: bot başına check
    kucukSermaye: a.kucukSermaye === true || a.kucukSermaye === false ? a.kucukSermaye : 'oto',
    tavanAkis: a.tavanAkis !== false,   // 69.3: yatırma/çekme sermaye tavanını izler (canlıda onaylı üst sınırla)
    hesapKesicisi: canliMi ? { uyari: 0.30, acil: 0.40 } : null,   // Ö6: yalnız gerçek parada
    // 74.3 D4: veri kalitesi kapısı (kayıt bot dizininde veri-kalitesi.jsonl); kip ayardan her çalışmada okunur
    veriKalitesi: ortam.veriKapisi({ dizin, kaydet }),
    kapiFn: canliMi ? ortam.kapiFn(ad) : null };            // denetim #2: kapı çalışırken de denetlenir
  // A2 parça 2 (TASARIM §7.5): işlem borsası Binance değilse (OKX botu) — yürütücü bağdaştırıcıyı `borsa`dan seçer, kol evreni Binance PIT
  // (aday 'veri'), işlem borsasında olmayan sembolde hedef 0 (islemBorsasi = görünen ad). Canlı hesap YOK. Binance'te hiçbir alan eklenmez.
  const borsa = o.borsa || 'binance';
  if (borsa !== 'binance') {
    if (canliMi) throw new Error(botKayit.BORSA_CANLI_RED);
    const bd = require('../live/borsalar').al(borsa);
    yurutucu.borsa = bd.kimlik;
    bot.islemBorsasi = bd.ad;
    bot.evren = { ...bot.evren, aday: 'veri' };
  }
  if (yeniBot) {
    // 74.5 (yalnız yeni botlar; Kairos/Tao nesnesine HİÇ eklenmez → bit bit aynı): görünen ad kayıttan (Telegram/günlük "Kairos" demesin);
    // kâğıtta gölge (hucum.C0 / denge.C0) sapması ENGEL koymaz, yalnız UYARI (karar §10 #4 — kıyas: model; küçük sermayede fark büyür).
    if (o.adGorunen) bot.adGorunen = String(o.adGorunen);
    if (mod === 'kagit') bot.golgeEngelUyari = true;
  }
  return { ad, strateji, mod, dizin, canliMi, etiket, tavan, btcAyak, ayar: a, kaydet, yurutucu, bot, ...(borsa !== 'binance' ? { borsa } : {}) };
}

/** 74.5: yeni botlar için gerçek para kapalı (karar: 5. faza kadar). */
const YENI_CANLI_RED = 'gerçek para hesabı 5. faza kadar yalnız mevcut botlarda (Kairos, Tao) — yeni bot canlı moda geçemez, canlı hesaba bağlanamaz';

/** Bot kaydından argümanlar (kayıt → botKayit.ayar → argumanlarAyardan). `sirlar` = bellekteki sır alanları (kayıtta yok). */
function argumanlar(kayit, mod, ortam, sirlar = {}) {
  const yeniBot = !botKayit.GOC_ADLAR.includes(kayit.kimlik);
  const borsa = botKayit.borsaKimligi(kayit);   // A2 parça 2: yalnız Binance dışıysa seçeneğe girer (Binance'te argümanlar birebir)
  return argumanlarAyardan({ ...botKayit.ayar(kayit), ...sirlar }, kayit.kimlik, mod, ortam,
    yeniBot ? { strateji: kayit.strateji, yeniBot: true, adGorunen: kayit.adGorunen || null, ...(borsa !== 'binance' ? { borsa } : {}) } : { strateji: kayit.strateji });
}

module.exports = { argumanlar, argumanlarAyardan, btcAyakSec, MODLAR, YENI_CANLI_RED };
