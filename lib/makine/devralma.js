'use strict';
/**
 * DEVRALMA (4. faz parça 4b — TASARIM-MAKINE-HESAP-BOT §5.2 d1/d2, §5.5, §5.7 → §11 #5, #6, #9; PLAN-MAKINE-HESAP-BOT §5)
 * ═══════════════════════════════════════════════════════════════════════════
 * Bir SUNUCU kalıcı olarak gidince (bozuldu, çalındı, yandı) öbür sunucu o makinenin botunu SON EŞ KOPYASINDAN (4a, lib/makine/kopya.js)
 * kendi kaydına alır. KENDİLİĞİNDEN ASLA: yalnız bu bilgisayardaki panelden, yerel PIN + "DEVRAL" onayıyla (uç lib/makine/api.js).
 *
 * KOŞULLAR (hepsi; biri tutmazsa hiçbir şey değişmez):
 *   · bu makine SUNUCU (geliştirme / araştırma kopyası devralmaz), günlük karar penceresi (UTC 23:50–01:30) dışı;
 *   · eş eşlenmiş bir SUNUCU ve en az 30 dk SESSİZ (son nabız ve son başarılı kopya — hangisi yeniyse — 30 dk'dan eski) VE şu an
 *     taze yoklamada da ULAŞILAMIYOR (ulaşılıyorsa: "devralma değil taşıma");
 *   · ulaşılabilen başka bir sunucu eşi o makineyi son 30 dk içinde GÖRMEMİŞ (görmüşse ağ bölünmesi şüphesi — red);
 *   · son kopya var ve manifestiyle BİREBİR (her dosya SHA-256); bot kopyada kayıtlı, sahibi o eş;
 *   · bot devralınabilir: CANLI HESAP botu devralınamaz (bu sürümde), Kairos demo kabulü (2026-12-09'a kadar; demo modunda ya da
 *     hucum-demo kopyada doluyken) devralınamaz, model örnekleri devralınmaz (lib/makine/nobet.js tasinabilirMi);
 *   · bu makinede çakışma yok (lib/sunucu/makineUclari.js hedefDenetle: aynı kimlikli bot çalışıyor / kendi demo hesabıyla kayıtlı,
 *     aynı emir öneki, aynı borsa hesabını kullanan başka bot); başka bir eş o botun daha yeni nöbetini taşımıyor;
 *   · demo: gizli.enc bu makinenin YEDEK ŞİFRESİYLE çözülür (yalnız burada, yalnız bellekte), içindeki hesap bot kaydının hesabıyla aynı,
 *     bu makinede aynı kimlikli FARKLI anahtar yok (üzerine yazılmaz).
 *
 * ADIMLAR: nöbet = max(bilinen) + 1 (kopyadaki kayıt, bu makinedeki kayıt, eşlerin son özetleri, taze yanıtlar) → yerleşim günlüğüyle
 * (lib/makine/botTasima.js ile AYNI biçim: <veri>/tasima/bot-<kimlik>-<damga>/yerlesim.json — açılış onarımı yarımı geri alır)
 * kopyadaki bot dizinleri geçici klasöre kopyalanır ve SHA-256 ile yeniden doğrulanır, botun "çalışıyor" işareti kapatılır (bot burada
 * kendiliğinden başlamasın), eksik anahtar eklenir, var olan dizinler onceki-bot-<kimlik>-<damga>'ya TAŞINIR (silinmez), kayıt
 * (makine = bu makine, nöbet n) YAZILIR (= tamamlanma noktası), bot tasima-bekliyor'a girer, yeniden kurulur (BAŞLATILMAZ) →
 * ulaşılabilen her sunucu eşine POST /api/makine/nobet-bildir → Telegram ("… X'te devralındı; Y açılınca o botu başlatmayacak").
 *
 * BORSA MUTABAKATI: kâğıt botta kâğıt borsa dosyası kopyayla geldiği için normal mutabakat (temiz → Başlat açılır). DEMO botta son kopya
 * ile borsa arasında ≤ 1 saatlik fark olabilir (eski makine o arada emir vermiş, dolum olmuş olabilir): bot bağlanır (kol mutabakatı
 * YAPILMADAN) ve borsadaki bizim önekli, bu defterin bilmediği emirler LİSTELENİR (yürütücü sahiplenAdaylari — salt okuma). Kullanıcı
 * listeyi ekranda görüp onaylar (yerel PIN + "SAHİPLEN") → yürütücü `mutabakat({ sahiplen })` onaylananları deftere alır (sayaç onların
 * üstüne çıkar: aynı clientOrderId YENİDEN ÜRETİLMEZ), sonra kol mutabakatı (botun bilmediği açık emir "sahipsiz" iptal edilir; dolumdan
 * doğan pozisyon farkı ENGEL olarak kalır — fark listesi). Liste onaydan sonra değişmişse onay geçersiz (yeniden bakılır). Onaydan önce
 * bu botta Mutabakat / Kuru / Başlat / Çalıştır kapalı (acil serbest). Temizse Başlat açılır — kullanıcı basar.
 *
 * ESKİ MAKİNE GERİ GELİRSE (bölünmüş beyin kuralları — lib/makine/nobet.js):
 *   · açılışta: eşlerde daha büyük nöbet → bot başlamaz, kayıt devredilir; eşlere ulaşamazsa da başlamaz (75.5 açılış kuralı);
 *   · çalışırken: nöbet bildirimi ya da her nabız (gelen / giden özet) daha büyük nöbet gösterirse bot HEMEN durdurulur (`nobetIzle`;
 *     kayıt önce yazılır — yerel kural o andan sonra her bağlantıyı kapatır), Telegram alarmı;
 *   · iki makine ayrı ayrı aynı nöbetle devralmışsa büyük makine kimliği kazanır, küçük olan durur;
 *   · ikinci savunma: borsa mutabakatı (yürütücü defterinde olmayan önekli emir / pozisyon farkı ENGEL — mevcut davranış).
 *   SINIR: eski makine AÇIK ama ağı TAMAMEN kopuksa (ne eşini ne öbür sunucuyu görüyor, borsaya ise erişiyor) ağ geri gelene kadar iki
 *   makine aynı hesaba emir gönderebilir — bunu iki makineli bir düzende yalnız insan kesin bilebilir; onay penceresi "önce eski
 *   makinenin kapalı olduğundan emin olun (fişini çekin / Tailscale'den çıkarın)" der. Ağ gelince ilk nabızda eski kopya durur.
 *
 * Bu modül komut satırı, alt süreç, PowerShell, Görev Zamanlayıcı, ACL kullanmaz; şifre çözme yalnız lib/paket.js; ağ yalnız
 * lib/makine/istemci.js; bot / kayıt / sır yazımı sunucu bağdaştırıcısında (lib/sunucu/makineUclari.js `BOT`).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('../paket');
const protokol = require('./protokol');
const istemci = require('./istemci');
const nabizLib = require('./nabiz');
const nobetLib = require('./nobet');
const kopyaLib = require('./kopya');
const botTasima = require('./botTasima');

const YETENEK = 'devralma-1';
const SESSIZ_ESIK_MS = 30 * 60 * 1000;
/** Sahiplen penceresi: kopyanın kaynak saatinden bu kadar önceki kapanmış emirler de sorulur (saat farkı, kopya süresi payı). */
const KOPYA_PAY_MS = 15 * 60 * 1000;
/** Kopya bundan eskiyse devralma ekranı ayrıca uyarır (engel değil). */
const ESKI_KOPYA_MS = 6 * 60 * 60 * 1000;
const LISTE_TAVAN = 200;
const BOT_RE = /^[a-z][a-z0-9]{1,15}$/;
const KAYIT_YOL_RE = /^live\/botlar\/([a-z][a-z0-9]{1,15})\.json$/;
const ONAY = 'DEVRAL';
const SAHIPLEN_ONAY = 'SAHİPLEN';
const SAHIPLEN_BEKLER = ['bekliyor', 'sahiplen-bekliyor', 'elle'];

const hata = (mesaj, durum = 400, kod) => Object.assign(new Error(mesaj), { durum, kod });
const damga = (t = Date.now()) => new Date(t).toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
function jsonOku(f, yedek = null) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return yedek; } }
function jsonYaz(f, n) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const g = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(g, JSON.stringify(n, null, 1), 'utf8');
  fs.renameSync(g, f);
}
const dkMetin = (ms) => { const dk = Math.max(0, Math.round(ms / 60000)); return dk < 60 ? `${dk} dk` : dk < 48 * 60 ? `${Math.round(dk / 6) / 10} sa`.replace('.', ',') : `${Math.round(dk / 1440)} gün`; };

/* ══ Saf kurallar ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Saf: eşle son temas (ms | null) = son nabız görülmesi ve son başarılı kopya — hangisi yeniyse. */
function sonTemas({ esDurum, kopyaSon } = {}) {
  const t = [nabizLib.sonGorulme(esDurum || {}), Date.parse((kopyaSon && kopyaSon.basari) || '')].filter(Number.isFinite);
  return t.length ? Math.max(...t) : null;
}

/** Saf: eş devralmaya uygun sessizlikte mi → null | { kod, metin }. */
function sessizlikEngeli({ sonTemasMs, esikMs = SESSIZ_ESIK_MS, simdi = Date.now(), esAd = 'eş' }) {
  if (!Number.isFinite(sonTemasMs)) return { kod: 'hic', metin: `${esAd} ile hiç temas kaydı yok — kopyası olmayan makineden devralınmaz` };
  const g = simdi - sonTemasMs;
  if (g < esikMs) return { kod: 'sessiz-degil', metin: `${esAd} ${dkMetin(g)} önce görüldü — devralma yalnız eş ${Math.round(esikMs / 60000)} dakikadan uzun sessizken açılır (makine çalışıyorsa Taşı kullanın)` };
  return null;
}

/**
 * Saf: kopya klasörünün manifestinden botlar (dosya okumadan kayıt dışı; kayıt dosyaları okunur).
 * @returns { manifest, botlar: [{ kimlik, kayit, dizinler: [ad], demoDizinDolu, bozuk }] }
 */
function kopyaBotlari(kopyaKlasor) {
  const m = jsonOku(path.join(kopyaKlasor, kopyaLib.MANIFEST_AD));
  if (!m || m.bicim !== kopyaLib.BICIM || !m.dosyalar || typeof m.dosyalar !== 'object') return { manifest: null, botlar: [] };
  const yollar = Object.keys(m.dosyalar);
  const botlar = [];
  for (const y of yollar) {
    const x = KAYIT_YOL_RE.exec(y);
    if (!x) continue;
    const k = x[1];
    let kayit = null, bozuk = null;
    try { kayit = JSON.parse(fs.readFileSync(kopyaLib.kopyaDosyaYolu(kopyaKlasor, y), 'utf8').replace(/^﻿/, '')); } catch (e) { bozuk = e.message; }
    if (kayit && (typeof kayit !== 'object' || kayit.kimlik !== k)) { bozuk = 'kayıt kimliği dosya adıyla aynı değil'; kayit = null; }
    const dizinler = [k, `${k}-demo`, `${k}-canli`].filter(ad => yollar.some(p => p.startsWith(`live/${ad}/`)));
    botlar.push({ kimlik: k, kayit, bozuk, dizinler, demoDizinDolu: yollar.some(p => p.startsWith(`live/${k}-demo/`)) });
  }
  botlar.sort((a, b) => a.kimlik.localeCompare(b.kimlik));
  return { manifest: m, botlar };
}

/** Saf: kopyadaki bot bu eşten devralınabilir mi → null | { kod, metin }. */
function devralinabilirMi({ kayit, es, ben, demoDizinDolu = false, simdi = Date.now() } = {}) {
  if (!kayit) return { kod: 'kayit-yok', metin: 'botun kaydı kopyada okunamadı' };
  if (kayit.motor === 'model') return { kod: 'model', metin: 'model örnekleri (Nova / Lydia / Simurg kâğıt hesabı) devralınmaz — yalnız bindirme botları' };
  if (kayit.motor !== 'bindirme') return { kod: 'motor', metin: `bu bot türü devralınamaz (${kayit.motor || '?'})` };
  if (kayit.arsiv) return { kod: 'arsiv', metin: 'arşivdeki bot devralınmaz' };
  const m = kayit.makine && protokol.KIMLIK_RE.test(String(kayit.makine)) ? kayit.makine : null;
  if (m && m === ben) return { kod: 'burada', metin: 'kopyaya göre bu bot zaten bu bilgisayara taşınmıştı — devralma gerekmez' };
  if (m && m !== es) return { kod: 'baska-makinede', metin: `kopyaya göre bu bot o makinede değil (${m} makinesine taşınmıştı) — devralınmaz` };
  if (kayit.mod === 'canli') return { kod: 'canli', metin: 'Canlı hesap botu devralınamaz (bu sürümde) — canlı hesapta makine değiştirmek bu planda yok' };
  const red = nobetLib.tasinabilirMi({ kimlik: kayit.kimlik, motor: 'bindirme', mod: kayit.mod, demoDizinDolu }, simdi);
  if (red && red.kod === 'kairos-demo') return { kod: 'kairos-demo', metin: 'Kairos demo kabulü 2026-12-09\'a kadar sürüyor — Kairos (ve demo kabul klasörü hucum-demo) bu tarihe kadar devralınamaz' };
  if (red) return { kod: red.kod, metin: red.metin.replace(/taşınamaz|taşınmaz/g, 'devralınamaz') };
  return null;
}

/** Saf: bilinen nöbetlerden yeni nöbet (en büyük + 1). */
function yeniNobet(bilinen) { return Math.max(0, ...(bilinen || []).map(Number).filter(Number.isInteger)) + 1; }

/** Saf: sahiplen listesinin özeti (onay bu özetle bağlanır — liste değişirse onay geçersiz). */
function listeOzeti({ acik = [], kapanmis = [] } = {}) {
  const s = (l) => (l || []).map(x => `${x.id}|${x.durum}|${+x.dolan || 0}`).sort();
  return sha256(JSON.stringify({ a: s(acik), k: s(kapanmis) })).slice(0, 32);
}

/** Saf: sahiplen satırının etkisi (kullanıcıya gösterilen). */
function satirEtkisi(x, tur) {
  if (tur === 'acik') return 'açık emir — deftere alınır; botun durumunda yoksa kol mutabakatı "sahipsiz" sayıp iptal eder (bot kendi emrini sonra yeniden koyar)';
  if (x.durum === 'DOLDU' || (+x.dolan || 0) > 0) return 'dolmuş emir — deftere alınır; botun durumunda yoksa pozisyon farkı ENGEL olarak kalır (fark listesi)';
  return 'kapanmış emir (dolumsuz) — deftere alınır; kimlik sayacı bunun üstüne çıkar';
}

/* ══ Kurucu ══════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * @param o.kopyaKlasoru (es) → <veri>/es-kopya/<es>/kopya · o.kopyaSonu (es) → son.json | null
 * @param o.tasimaKlasor <veri>/tasima (bot-tasima.json + yerleşim günlükleri — botTasima ile ortak)
 * @param o.oncekiYolu   (bot, damga) → <veri>/onceki-bot-<bot>-<damga>
 * @param o.ben, o.rol, o.eslesme, o.nabiz, o.yedekSifre, o.surum, o.kararPenceresi, o.log, o.bildir (tur, baslik, satirlar), o.simdi, o.fetchFn
 * @param o.bot          sunucu bağdaştırıcısı (makineUclari BOT): bilgi, hedefDenetle, sirDenetle, sirYaz, sirGeriAl, kayitDogrula, dosyaKaydi,
 *                       kayitYaz, kayitGeriYukle, dizinYolu, dizinlerAdlar, yenidenKur, mutabakat, sahipYaz, bekleyenEkle, bekleyenCikar,
 *                       saglikYaz, calisiyorMu, durdur, sahiplenListe, sahiplen
 * @param o.esOzeti      (es, ms) → { ok, ozet, hata } (botTasima.esOzeti)
 * @param o.esikMs       () → eş sessizlik eşiği (varsayılan 30 dk; öz test kısaltır)
 * @param o.kilit        () → başka bir yerleşim sürüyor mu (botTasima) → bot kimliği | null
 */
function olustur(o) {
  const log = o.log || (() => {});
  const bildir = o.bildir || (() => {});
  const simdi = o.simdi || Date.now;
  const B = o.bot;
  const klasor = o.tasimaKlasor;
  const zaman = () => new Date(simdi()).toISOString();
  const esik = () => { const v = o.esikMs ? Number(o.esikMs()) : SESSIZ_ESIK_MS; return Number.isFinite(v) && v >= 0 ? v : SESSIZ_ESIK_MS; };
  let suruyor = null;
  const durum = () => botTasima.durumOku(klasor);
  const botDurum = (k) => durum().botlar[k] || null;
  const botDurumYaz = (k, v) => botTasima.durumGuncelle(klasor, k, () => v);
  const durumGuncelle = (k, fn) => botTasima.durumGuncelle(klasor, k, (x) => fn(x));
  const esAd = (kimlik) => { try { return (o.eslesme.es(kimlik) || {}).ad || kimlik; } catch { return kimlik; } };
  const sunucuEsleri = () => {
    const d = o.nabiz.oku();
    return o.eslesme.liste().makineler.filter(m => ((nabizLib.enYeniOzet(d.esler[m.kimlik] || {}) || {}).rol || m.rol) === 'sunucu');
  };
  const devralmaMi = (t) => !!t && t.asama === 'geldi' && t.tur === 'devralma';

  /** Eşin kopya durumu (dosya okumaz; manifest + son.json). */
  function esKopyasi(es) {
    const kk = o.kopyaKlasoru(es.kimlik);
    const son = (() => { try { return o.kopyaSonu(es.kimlik); } catch { return null; } })();
    const { manifest, botlar } = kopyaBotlari(kk);
    return { kk, son, manifest, botlar };
  }

  /** Devralma ekranı (GET /api/makine/devralma): eşler × kopya × botlar; bu makinede devralınmış botların durumu. */
  function liste() {
    const t = simdi();
    const ben = o.ben();
    const d = o.nabiz.oku();
    const esler = sunucuEsleri().map(es => {
      const k = esKopyasi(es);
      const st = sonTemas({ esDurum: d.esler[es.kimlik], kopyaSon: k.son });
      const se = sessizlikEngeli({ sonTemasMs: st, esikMs: esik(), simdi: t, esAd: es.ad });
      const kz = k.manifest ? Date.parse(k.manifest.kaynakZaman || '') : NaN;
      const botlar = k.botlar.map(x => {
        const red = x.kayit ? devralinabilirMi({ kayit: x.kayit, es: es.kimlik, ben: ben.kimlik, demoDizinDolu: x.demoDizinDolu, simdi: t }) : { kod: 'kayit-yok', metin: `kayıt okunamadı (${x.bozuk || '?'})` };
        const yb = B.bilgi(x.kimlik);
        return { kimlik: x.kimlik, adGorunen: (x.kayit && x.kayit.adGorunen) || x.kimlik, mod: x.kayit ? x.kayit.mod : null, nobet: x.kayit && Number.isInteger(x.kayit.nobet) ? x.kayit.nobet : 0,
          dizinler: x.dizinler, devralinabilir: !red, neden: red ? red.metin : null, kod: red ? red.kod : null,
          burada: yb ? { var: true, sahipBen: !yb.makine || yb.makine === ben.kimlik, makine: yb.makine || null, mod: yb.mod, calisiyor: !!yb.calisiyor, nobet: yb.nobet } : null };
      });
      return { kimlik: es.kimlik, ad: es.ad, adres: es.adres, sonTemas: Number.isFinite(st) ? new Date(st).toISOString() : null, sessizDk: Number.isFinite(st) ? Math.round((t - st) / 60000) : null,
        sessiz: !se, sessizNeden: se ? se.metin : null,
        kopya: k.manifest ? { var: true, kaynakZaman: k.manifest.kaynakZaman || null, cekilen: k.manifest.cekilen || null, yasDk: Number.isFinite(kz) ? Math.round((t - kz) / 60000) : null,
          eski: Number.isFinite(kz) && t - kz > ESKI_KOPYA_MS, dosya: k.manifest.dosyaSayisi || 0, bayt: k.manifest.toplamBayt || 0, gizli: k.manifest.gizli || 'yok', kaynakSurum: (k.manifest.kaynak && k.manifest.kaynak.surum) || null } : { var: false },
        botlar };
    });
    const devralinanlar = Object.entries(durum().botlar).filter(([, v]) => devralmaMi(v) || (v && v.asama === 'yerlesiyor' && v.tur === 'devralma')).map(([k, v]) => {
      const yb = B.bilgi(k) || {};
      return { kimlik: k, adGorunen: yb.adGorunen || k, mod: yb.mod || null, asama: v.asama, kaynak: v.kaynak || null, kaynakAd: v.kaynak ? esAd(v.kaynak) : null, nobet: v.nobet, zaman: v.zaman,
        kopyaZaman: v.kopyaZaman || null, mutabakat: v.mutabakat || 'bekliyor', mutabakatNeden: v.mutabakatNeden || null, mutabakatZaman: v.mutabakatZaman || null,
        sahiplen: v.sahiplen ? { ozet: v.sahiplen.ozet, zaman: v.sahiplen.zaman, destek: v.sahiplen.destek !== false, acik: v.sahiplen.acik || [], kapanmis: v.sahiplen.kapanmis || [], hata: v.sahiplen.hata || null, sonuc: v.sahiplen.sonuc || null } : null,
        bildirim: Array.isArray(v.bildirim) ? v.bildirim : [] };
    });
    return { rol: o.rol(), esikDk: Math.round(esik() / 60000), yedekSifre: !!o.yedekSifre(), esler, devralinanlar, onay: ONAY, sahiplenOnay: SAHIPLEN_ONAY };
  }

  /** Taze yoklama: bütün sunucu eşleri (devralınan eş dahil — ulaşılabiliyorsa devralma yok). */
  async function tazeYoklama(zamanAsimiMs = 6000) {
    const esler = sunucuEsleri();
    return Promise.all(esler.map(async (es) => ({ kimlik: es.kimlik, ad: es.ad, ...(await o.esOzeti(es, zamanAsimiMs)) })));
  }

  /* ── DEVRAL ── */

  /** POST /api/makine/devral { es, bot } (yalnız bu bilgisayar + yerel PIN + "DEVRAL" — uç denetler). @returns { durum, govde } */
  async function devral({ es: esK, bot: k }) {
    const ben = o.ben();
    const red = (durumKodu, kod, error, ek = {}) => ({ durum: durumKodu, govde: { success: false, kod, error, ...ek } });
    if (o.rol() !== 'sunucu') return red(409, 'gelistirme', 'Geliştirme / araştırma kopyası bot devralmaz — devralma bot çalıştıracak SUNUCUDA yapılır.');
    if (o.kararPenceresi && o.kararPenceresi()) return red(409, 'pencere', 'Günlük karar penceresi (UTC 23:50–01:30) sürüyor — devralma bu sırada yapılmaz; pencere bitince yeniden deneyin.');
    if (!protokol.KIMLIK_RE.test(String(esK || ''))) return red(400, 'es', 'eş makine kimliği geçersiz');
    if (!BOT_RE.test(String(k || ''))) return red(400, 'bot', 'bot kimliği geçersiz');
    if (esK === ben.kimlik) return red(400, 'es', 'Bu bilgisayar kendinden devralmaz.');
    if (suruyor) return red(409, 'suruyor', `Bu bilgisayarda başka bir devralma sürüyor (${suruyor}) — bitince yeniden deneyin.`);
    const dk = o.kilit ? o.kilit() : null;
    if (dk) return red(409, 'suruyor', `Bu bilgisayarda bir bot taşıması sürüyor (${dk}) — bitince yeniden deneyin.`);
    const es = o.eslesme.es(esK);
    if (!es) return red(404, 'es', 'Bu kimlikte eşlenmiş makine yok.');
    const d = o.nabiz.oku();
    const ozetEs = nabizLib.enYeniOzet(d.esler[esK] || {}) || {};
    if ((ozetEs.rol || es.rol) !== 'sunucu') return red(409, 'rol', `${es.ad} geliştirme / araştırma bilgisayarı — onda bot çalışmaz, devralınacak bot yok.`);
    const kk = o.kopyaKlasoru(esK);
    let son = null; try { son = o.kopyaSonu(esK); } catch { son = null; }
    const se = sessizlikEngeli({ sonTemasMs: sonTemas({ esDurum: d.esler[esK], kopyaSon: son }), esikMs: esik(), simdi: simdi(), esAd: es.ad });
    if (se) return red(409, se.kod, se.metin);
    const kb = kopyaBotlari(kk);
    if (!kb.manifest) return red(409, 'kopya-yok', `${es.ad} makinesinin kopyası bu bilgisayarda yok — devralma son eş kopyasından yapılır (Ayarlar › Makineler › Eş kopyaları).`);
    const x = kb.botlar.find(b => b.kimlik === k);
    if (!x) return red(404, 'bot', `${es.ad} kopyasında "${k}" botu yok.`);
    const kayitKopya = x.kayit;
    const rd = devralinabilirMi({ kayit: kayitKopya, es: esK, ben: ben.kimlik, demoDizinDolu: x.demoDizinDolu, simdi: simdi() });
    if (rd) return red(409, rd.kod, rd.metin);
    // Bu makine botun kopyadakinden YENİ bir nöbetinin sahibiyse (ör. zaten devralınmış) kopya eskidir
    const ybOnce = B.bilgi(k);
    if (ybOnce && (!ybOnce.makine || ybOnce.makine === ben.kimlik) && (Number(ybOnce.nobet) || 0) > (Number(kayitKopya.nobet) || 0)) {
      return red(409, 'zaten-burada', `Bu bilgisayar bu botun daha yeni nöbetinin sahibi (nöbet ${ybOnce.nobet} > kopyadaki ${Number(kayitKopya.nobet) || 0}) — kopya eski; devralma gerekmez.`);
    }
    // Kopyanın bütünlüğü: her dosya manifestiyle (SHA-256)
    const dg = kopyaLib.kopyaDogrula(kk);
    if (!dg.ok) return red(409, 'kopya-bozuk', `${es.ad} kopyası doğrulanamadı (${dg.hatalar.slice(0, 3).join('; ')}) — bozuk kopyadan devralınmaz; eş geri gelirse yeni kopya alınır.`);
    // Bu makinede çakışma (çalışan aynı bot, emir öneki, hesap, Kairos demo kabulü)
    const hd = B.hedefDenetle({ kimlik: k, mod: kayitKopya.mod, strateji: kayitKopya.strateji, hesap: kayitKopya.hesap && kayitKopya.hesap.demo, kaynak: esK });
    if (hd) return red(409, 'hedef', `Bu bilgisayarda: ${hd}`);
    // Sırlar (demo): gizli.enc yalnız yedek şifresiyle, yalnız bellekte
    let sir = null;
    const gizliYol = path.join(kk, kopyaLib.GIZLI_AD);
    const gizliVar = fs.existsSync(gizliYol);
    if (kayitKopya.mod === 'demo' || gizliVar) {
      const sifre = o.yedekSifre();
      if (!sifre && kayitKopya.mod === 'demo') return red(409, 'yedek-sifre-yok', 'Bu bilgisayarda yedek şifresi yok — demo hesabının anahtarı kopyada yedek şifresiyle şifreli. Ayarlar › Yedek & taşıma\'dan AYNI yedek şifresini girin.');
      if (sifre && gizliVar) {
        let acik = null;
        try {
          const g = JSON.parse(fs.readFileSync(gizliYol, 'utf8'));
          if (!g || g.bicim !== kopyaLib.GIZLI_BICIM) throw new Error('biçim');
          acik = P.coz(Buffer.from(String(g.veri || ''), 'base64'), sifre, g.kripto);
          const j = JSON.parse(acik.toString('utf8'));
          const h = (Array.isArray(j.hesaplar) ? j.hesaplar : []).find(y => y && y.bot === k) || null;
          sir = { hesap: h ? { id: h.id, sabit: !!h.sabit, ad: h.ad, borsa: h.borsa, tur: h.tur, altHesap: h.altHesap || null, apiKey: h.apiKey, apiSecret: h.apiSecret } : null,
            saglik: j.saglik && typeof j.saglik[k] === 'string' ? j.saglik[k] : null };
        } catch {
          if (kayitKopya.mod === 'demo') return red(409, 'sifre-farkli', 'Kopyadaki şifreli anahtar bu bilgisayarın yedek şifresiyle çözülemedi — iki bilgisayarda yedek şifresi aynı olmalı (Ayarlar › Yedek & taşıma).');
          sir = null;
        } finally { if (acik) acik.fill(0); }
      }
      if (kayitKopya.mod === 'demo') {
        if (!sir || !sir.hesap) return red(409, 'sir', `${es.ad} kopyasında bu demo botun hesap anahtarı yok — devralınamaz (kopya sırları yalnız taşınabilir demo botlar için tutar).`);
        const sd = B.sirDenetle(k, sir, kayitKopya);
        if (sd) { sir = null; return red(409, 'sir', `Bu bilgisayarda: ${sd}`); }
      }
    }
    // Taze yoklama: devralınan eş ulaşılabiliyor mu; başka bir sunucu onu az önce gördü mü; başka biri botun daha yeni nöbetini taşıyor mu
    const yanitlar = await tazeYoklama();
    const yEs = yanitlar.find(y => y.kimlik === esK);
    if (yEs && yEs.ok) { sir = null; return red(409, 'ulasilabilir', `${es.ad} şu an ULAŞILABİLİR — devralma yalnız kalıcı olarak giden makine için. Makine çalışıyorsa botu Taşı ile alın (Botu başka makineye taşı).`); }
    const bilinen = [kayitKopya.nobet];
    const yb = B.bilgi(k);
    if (yb) bilinen.push(yb.nobet);
    for (const m of o.eslesme.liste().makineler) { const z = nabizLib.enYeniOzet(d.esler[m.kimlik] || {}); const b = z && nobetLib.esBotu(z, k); if (b) bilinen.push(b.nobet); }
    const uyarilar = [];
    for (const y of yanitlar) {
      if (y.kimlik === esK) continue;
      if (!y.ok) { uyarilar.push(`${y.ad}: yoklanamadı (${y.hata}) — o makinenin ${es.ad}'yi görüp görmediği bilinmiyor`); continue; }
      const gr = Array.isArray(y.ozet.gorulen) ? y.ozet.gorulen.find(g => g && g.kimlik === esK) : null;
      const gz = gr ? Date.parse(gr.zaman || '') : NaN;
      if (Number.isFinite(gz) && simdi() - gz < esik()) { sir = null; return red(409, 'bolunme', `${y.ad}, ${es.ad} makinesini ${dkMetin(simdi() - gz)} önce gördü — ${es.ad} açık ama bu bilgisayardan kopuk olabilir (ağ bölünmesi). Devralma yapılmadı; Tailscale bağlantılarına bakın.`); }
      const b = nobetLib.esBotu(y.ozet, k);
      if (b) {
        bilinen.push(b.nobet);
        const sahip = b.makine && protokol.KIMLIK_RE.test(String(b.makine)) ? b.makine : y.kimlik;
        if ((Number(b.nobet) || 0) > (Number(kayitKopya.nobet) || 0) && sahip !== esK) { sir = null; return red(409, 'baska-sahip', `${y.ad} bu botun daha yeni nöbetini taşıyor (nöbet ${b.nobet}, sahibi ${esAd(sahip)}) — bot ${es.ad}'de değil; devralma yapılmadı.`); }
      }
    }
    const nb = yeniNobet(bilinen);
    // ── YERLEŞTİR (günlükle; botTasima.al ile aynı biçim — açılış onarımı yarımı geri alır)
    suruyor = k;
    const oncekiDurum = botDurum(k);
    const dmg = `${damga(simdi())}-${crypto.randomBytes(3).toString('hex')}`;
    const gecici = path.join(klasor, `bot-${k}-${dmg}`);
    const gunlukDosya = path.join(gecici, botTasima.GUNLUK_AD);
    let gunluk = null;
    const kopyaZaman = kb.manifest.kaynakZaman || null;
    const geriAl = (neden, durumKodu, kod) => {
      if (gunluk) {
        botTasima.gunlukGeriAl(gunluk, { kayitGeriYukle: (bk, eski) => B.kayitGeriYukle(bk, eski), sirGeriAl: (e) => B.sirGeriAl(e) }, log);
        try { jsonYaz(gunlukDosya, { ...gunluk, durum: 'geri-alindi', neden }); } catch { /* */ }
        try { B.yenidenKur(k, { geriAlma: true }); } catch (e) { log('ERROR', `🛟 ${k}: geri almadan sonra bot yeniden kurulamadı: ${e.message}`); }
      }
      botDurumYaz(k, oncekiDurum);
      try { for (const a of fs.readdirSync(gecici)) if (a !== botTasima.GUNLUK_AD) fs.rmSync(path.join(gecici, a), { recursive: true, force: true }); } catch { /* */ }
      if (!gunluk) { try { fs.rmSync(gecici, { recursive: true, force: true }); } catch { /* */ } }
      log('WARN', `🛟 ${es.ad} → bu bilgisayar: "${k}" devralması yapılamadı/geri alındı — ${neden}`);
      return red(durumKodu || 409, kod || 'yerlesim', neden);
    };
    let saglikGelen = sir && sir.saglik ? sir.saglik : null;
    try {
      botDurumYaz(k, { asama: 'yerlesiyor', tur: 'devralma', kaynak: esK, nobet: nb, zaman: zaman(), onceki: oncekiDurum });
      const kayit = { ...JSON.parse(JSON.stringify(kayitKopya)), makine: ben.kimlik, nobet: nb };
      const kv = B.kayitDogrula(kayit);
      if (kv) { sir = null; return geriAl(`kopyadaki bot kaydı geçersiz: ${kv}`, 409, 'kayit'); }
      // 1. kopyadaki dizinler geçici klasöre — her dosya manifestteki SHA-256 ile yeniden doğrulanır; "çalışıyor" işareti kapatılır
      const man = dg.manifest.dosyalar;
      for (const ad of x.dizinler) {
        const onek = `live/${ad}/`;
        for (const [y, dd] of Object.entries(man)) {
          if (!y.startsWith(onek)) continue;
          const buf = fs.readFileSync(kopyaLib.kopyaDosyaYolu(kk, y));
          if (buf.length !== dd.boyut || sha256(buf) !== dd.sha256) { sir = null; return geriAl(`kopya dosyası değişmiş (${y}) — devralma yapılmadı`, 409, 'kopya-bozuk'); }
          const hedef = path.join(gecici, 'veri', ad, ...y.slice(onek.length).split('/'));
          fs.mkdirSync(path.dirname(hedef), { recursive: true });
          fs.writeFileSync(hedef, buf);
        }
        calismaIsaretiKapat(path.join(gecici, 'veri', ad));
      }
      gunluk = { durum: 'basladi', tur: 'devralma', bot: k, kaynak: esK, nobet: nb, zaman: zaman(), gecici, adimlar: [], kayitOnceki: B.dosyaKaydi(k), kayitYazildi: false, sirEklenen: [] };
      jsonYaz(gunlukDosya, gunluk);
      const tk1 = o.testKesinti && o.testKesinti('yerlesim-basi');
      if (tk1) throw Object.assign(hata('test kesintisi (yerleşim başı)', 500), { testOlum: tk1 === 'olum' });
      if (sir && sir.hesap && kayit.mod === 'demo') { gunluk.sirEklenen = B.sirYaz(k, sir.hesap) || []; jsonYaz(gunlukDosya, gunluk); }
      sir = null;
      const oncekiKok = o.oncekiYolu(k, dmg);
      for (const ad of B.dizinlerAdlar(k)) {
        const yer = B.dizinYolu(ad);
        if (fs.existsSync(yer)) {
          const onceki = path.join(oncekiKok, ad);
          fs.mkdirSync(oncekiKok, { recursive: true });
          gunluk.adimlar.push({ tur: 'onceki', yer, onceki });
          jsonYaz(gunlukDosya, gunluk);
          fs.renameSync(yer, onceki);
        }
      }
      for (const ad of x.dizinler) {
        const kaynak = path.join(gecici, 'veri', ad);
        const yer = B.dizinYolu(ad);
        gunluk.adimlar.push({ tur: 'yeni', yer });
        jsonYaz(gunlukDosya, gunluk);
        fs.mkdirSync(path.dirname(yer), { recursive: true });
        if (fs.existsSync(kaynak)) fs.renameSync(kaynak, yer); else fs.mkdirSync(yer, { recursive: true });
      }
      const tk2 = o.testKesinti && o.testKesinti('kayit-oncesi');
      if (tk2) throw Object.assign(hata('test kesintisi (kayıt öncesi)', 500), { testOlum: tk2 === 'olum' });
      gunluk.kayitYazildi = true;
      jsonYaz(gunlukDosya, gunluk);
      B.kayitYaz(kayit);   // = devralmanın tamamlanma noktası
      gunluk.durum = 'kayit';
      jsonYaz(gunlukDosya, gunluk);
    } catch (e) {
      sir = null;
      if (e && e.testOlum && o.testKesinti) { suruyor = null; throw e; }
      const r = geriAl(`yerleştirme yarıda kaldı: ${e.message} — yapılanlar geri alındı`, 500, 'yerlesim');
      suruyor = null;
      return { durum: e.durum && e.durum < 500 ? e.durum : 500, govde: r.govde };
    } finally { if (!gunluk || gunluk.durum !== 'kayit') suruyor = null; }
    // ── tamamlandı: buradan sonrası devralmayı geri çevirmez (hata yalnız uyarı)
    try { B.bekleyenEkle(k, { kaynak: esK, nobet: nb }); } catch (e) { uyarilar.push(`mutabakat işareti yazılamadı: ${e.message}`); }
    try { B.yenidenKur(k, {}); } catch (e) { uyarilar.push(`bot yeniden kurulamadı (${e.message}) — Pusula'yı yeniden başlatınca yüklenir`); log('ERROR', `🛟 ${k}: devralınan bot kurulamadı: ${e.message}`); }
    try { const u = saglikGelen && B.saglikYaz ? B.saglikYaz(k, saglikGelen) : null; if (u) uyarilar.push(u); } catch (e) { uyarilar.push(`sağlık adresi yazılamadı: ${e.message}`); }
    saglikGelen = null;
    gunluk.durum = 'tamam';
    try { jsonYaz(gunlukDosya, gunluk); } catch { /* */ }
    try { for (const a of fs.readdirSync(gecici)) if (a !== botTasima.GUNLUK_AD) fs.rmSync(path.join(gecici, a), { recursive: true, force: true }); } catch { /* */ }
    const kopyaYasMs = Date.parse(kopyaZaman || '');
    botDurumYaz(k, { asama: 'geldi', tur: 'devralma', kaynak: esK, nobet: nb, zaman: zaman(), kopyaZaman, mutabakat: 'bekliyor', mod: kayitKopya.mod });
    suruyor = null;
    const bb = B.bilgi(k) || {};
    const adG = bb.adGorunen || kayitKopya.adGorunen || k;
    log('SUCCESS', `🛟 "${adG}" ${es.ad} makinesinin son kopyasından bu bilgisayara DEVRALINDI (nöbet ${nb}) — kendiliğinden başlamaz`);
    // nöbet bildirimi (ulaşılabilen sunucu eşlerine; devralınan eş kapalı — o geri gelince nabızda / açılışta görür)
    const bildirim = await nobetBildirGonder(k, nb, esK);
    durumGuncelle(k, (v) => (v ? { ...v, bildirim } : v));
    const yasMetin = Number.isFinite(kopyaYasMs) ? dkMetin(simdi() - kopyaYasMs) : '?';
    bildir('alarm', `${adG} ${ben.ad} makinesinde devralındı`, [
      `${es.ad} makinesi uzun süredir sessiz; bot ${es.ad} makinesinin ${yasMetin} önceki kopyasından ${ben.ad} makinesine alındı (nöbet ${nb}).`,
      `${es.ad} açılınca bu botu BAŞLATMAYACAK (daha yeni nöbet burada); çalışır hâlde geri gelirse ilk nabızda botu durdurur.`,
      kayitKopya.mod === 'demo' ? 'Sıradaki: Ayarlar › Makineler › Devralma — borsadaki emir listesini görüp onaylayın, sonra Botlar sayfasında Başlat.' : 'Sıradaki: borsayla (kâğıt) karşılaştırma kendiliğinden yapılır; temizse Botlar sayfasında Başlat.',
      `Nöbet bildirimi: ${bildirim.map(b => `${b.ad} ${b.sonuc}`).join(' · ') || 'başka sunucu eşi yok'}`
    ]);
    // sonraki adım yanıttan SONRA: kâğıtta mutabakat, demoda sahiplen listesi
    const t = setTimeout(() => {
      (kayitKopya.mod === 'demo' ? sahiplenListe(k) : kagitMutabakat(k)).catch(e => log('WARN', `🛟 ${k}: devralma sonrası borsa adımı yapılamadı: ${e.message}`));
    }, o.sonrakiGecikmeMs == null ? 500 : o.sonrakiGecikmeMs);
    if (t.unref) t.unref();
    return { durum: 200, govde: { success: true, bot: k, adGorunen: adG, kaynak: esK, kaynakAd: es.ad, nobet: nb, mod: kayitKopya.mod, kopyaZaman, sonraki: kayitKopya.mod === 'demo' ? 'sahiplen' : 'mutabakat', bildirim, uyarilar: uyarilar.slice(0, 16) } };
  }

  /** Kopyadan gelen bot durum dosyalarında "çalışıyor" işaretini kapatır (devralınan bot burada kendiliğinden başlamasın; .yedek dahil). */
  function calismaIsaretiKapat(dizin) {
    const f = path.join(dizin, 'bindirme-bot.json');
    for (const y of [f, `${f}.yedek`]) {
      const j = jsonOku(y);
      if (j && typeof j === 'object' && j.calisiyor) { j.calisiyor = false; fs.writeFileSync(y, JSON.stringify(j, null, 2), 'utf8'); }
    }
  }

  /** Kâğıt devralma: kâğıt borsa dosyası kopyayla geldi — normal mutabakat (temiz → tasima-bekliyor kalkar). */
  async function kagitMutabakat(k) {
    try {
      const m = await B.mutabakat(k);
      const temiz = !!m && !m.engel;
      durumGuncelle(k, (x) => (devralmaMi(x) ? { ...x, mutabakat: temiz ? 'temiz' : 'engel', mutabakatNeden: temiz ? null : String(m && m.engel).slice(0, 300), mutabakatZaman: zaman() } : x));
      return { temiz };
    } catch (e) {
      durumGuncelle(k, (x) => (devralmaMi(x) ? { ...x, mutabakat: 'elle', mutabakatNeden: String(e.message).slice(0, 300), mutabakatZaman: zaman() } : x));
      log('WARN', `🛟 ${k}: devralma sonrası mutabakat yapılamadı (${e.message}) — Botlar sayfasından Mutabakat'a basın`);
      return { temiz: false, hata: e.message };
    }
  }

  /** Sahiplen penceresinin başı: kopyanın kaynak saati − pay (kaynak saati yoksa devralma anı − 2 sa). */
  function bas(t) {
    const kz = Date.parse((t && t.kopyaZaman) || '');
    return Number.isFinite(kz) ? kz - KOPYA_PAY_MS : Date.parse(t && t.zaman || '') - 2 * 3600e3;
  }

  /** DEMO: borsadaki bizim önekli bilinmeyen emirler (SALT OKUMA) → durum.sahiplen; panel listeyi gösterir. */
  async function sahiplenListe(k) {
    const t = botDurum(k);
    if (!devralmaMi(t)) return { durum: 409, govde: { success: false, error: 'bu bot için süren devralma yok' } };
    if (!SAHIPLEN_BEKLER.includes(t.mutabakat || 'bekliyor')) return { durum: 409, govde: { success: false, error: `bu botun devralma mutabakatı tamamlandı (${t.mutabakat}) — Botlar sayfasından Mutabakat kullanın` } };
    let l;
    try { l = await B.sahiplenListe(k, bas(t)); }
    catch (e) {
      durumGuncelle(k, (x) => (devralmaMi(x) ? { ...x, mutabakat: 'elle', mutabakatNeden: `borsa listesi okunamadı: ${String(e.message).slice(0, 240)}`, mutabakatZaman: zaman(), sahiplen: { ...(x.sahiplen || {}), hata: String(e.message).slice(0, 300), zaman: zaman() } } : x));
      log('WARN', `🛟 ${k}: devralma — borsadaki emir listesi okunamadı (${e.message}); Ayarlar › Makineler › Devralma'dan "Listeyi yenile"`);
      return { durum: 502, govde: { success: false, error: `Borsadaki emir listesi okunamadı: ${e.message}` } };
    }
    const acik = (l.acik || []).slice(0, LISTE_TAVAN).map(x => ({ ...x, etki: satirEtkisi(x, 'acik') }));
    const kapanmis = (l.kapanmis || []).slice(0, LISTE_TAVAN).map(x => ({ ...x, etki: satirEtkisi(x, 'kapanmis') }));
    const ozet = listeOzeti({ acik, kapanmis });
    const s = { ozet, zaman: zaman(), bas: new Date(bas(t)).toISOString(), destek: l.destek !== false, acik, kapanmis, semboller: (l.semboller || []).slice(0, 80), hata: null, tasma: (l.acik || []).length > LISTE_TAVAN || (l.kapanmis || []).length > LISTE_TAVAN };
    durumGuncelle(k, (x) => (devralmaMi(x) ? { ...x, mutabakat: 'sahiplen-bekliyor', mutabakatNeden: null, sahiplen: s } : x));
    log('INFO', `🛟 ${k}: devralma — borsada bu defterin bilmediği ${acik.length} açık + ${kapanmis.length} kapanmış bizim önekli emir; kullanıcı onayı bekleniyor`);
    return { durum: 200, govde: { success: true, bot: k, sahiplen: s } };
  }

  /** DEMO: kullanıcı listeyi onayladı (yerel PIN + "SAHİPLEN" — uç denetler) → yürütücü mutabakat({ sahiplen }) + kol mutabakatı. */
  async function sahiplen({ bot: k, ozet }) {
    const t = botDurum(k);
    if (!devralmaMi(t)) return { durum: 409, govde: { success: false, error: 'bu bot için süren devralma yok' } };
    if (t.mod && t.mod !== 'demo') return { durum: 409, govde: { success: false, error: 'kâğıt botta sahiplen yok — Botlar sayfasından Mutabakat' } };
    if (!SAHIPLEN_BEKLER.includes(t.mutabakat || 'bekliyor')) return { durum: 409, govde: { success: false, error: `bu botun devralma mutabakatı tamamlandı (${t.mutabakat})` } };
    if (!t.sahiplen || !t.sahiplen.ozet || t.sahiplen.hata) return { durum: 409, govde: { success: false, kod: 'liste-yok', error: 'Önce borsadaki emir listesini alın ("Listeyi yenile").' } };
    // Liste ONAYDAN SONRA değişmiş olabilir: yeniden okunur; özet tutmazsa onay geçersiz (yeni liste gösterilir)
    const y = await sahiplenListe(k);
    if (y.durum !== 200) return y;
    const s = y.govde.sahiplen;
    if (String(ozet || '') !== t.sahiplen.ozet || s.ozet !== t.sahiplen.ozet) {
      return { durum: 409, govde: { success: false, kod: 'liste-degisti', error: 'Borsadaki liste onayladığınızdan farklı (yeni emir / dolum) — güncel listeye bakıp yeniden onaylayın.', sahiplen: s } };
    }
    const kimlikler = [...s.acik, ...s.kapanmis].map(x => x.id);
    let r;
    try { r = await B.sahiplen(k, { bas: Date.parse(s.bas), kimlikler }); }
    catch (e) {
      durumGuncelle(k, (x) => (devralmaMi(x) ? { ...x, mutabakat: 'elle', mutabakatNeden: `sahiplen mutabakatı yapılamadı: ${String(e.message).slice(0, 240)}`, mutabakatZaman: zaman() } : x));
      return { durum: 502, govde: { success: false, error: `Mutabakat yapılamadı: ${e.message}` } };
    }
    const ym = r.ym || {}, m = r.m || {};
    const sh = ym.sahiplen || { acik: [], kapanmis: [], onaysiz: [], bulunamadi: [] };
    const temiz = !ym.hata && !(ym.cozulemeyen || []).length && !m.engel;
    const neden = ym.hata ? `yürütücü: ${ym.hata}` : (ym.cozulemeyen || []).length ? `yürütücü: ${ym.cozulemeyen.length} emir çözülemedi` : m.engel || null;
    const sonuc = { acik: sh.acik.length, kapanmis: sh.kapanmis.length, onaysiz: sh.onaysiz.length, bulunamadi: sh.bulunamadi.length, sahipsizIptal: m.dca ? (m.dca.sahipsizIptal || 0) : 0, zaman: zaman() };
    durumGuncelle(k, (x) => (devralmaMi(x) ? { ...x, mutabakat: temiz ? 'temiz' : 'engel', mutabakatNeden: neden ? String(neden).slice(0, 300) : null, mutabakatZaman: zaman(), sahiplen: { ...(x.sahiplen || {}), sonuc } } : x));
    const bb = B.bilgi(k) || {};
    log(temiz ? 'SUCCESS' : 'WARN', `🛟 ${k}: devralma sahiplen — ${sonuc.acik + sonuc.kapanmis} emir deftere alındı, ${sonuc.sahipsizIptal} sahipsiz emir iptal; ${temiz ? 'mutabakat TEMİZ (Başlat açıldı)' : `TEMİZ DEĞİL: ${neden}`}`);
    bildir(temiz ? 'bilgi' : 'uyari', `${bb.adGorunen || k}: devralma mutabakatı ${temiz ? 'temiz' : 'TEMİZ DEĞİL'}`, [
      `Onaylanan ${kimlikler.length} emir deftere alındı (açık ${sonuc.acik}, kapanmış ${sonuc.kapanmis}); botun bilmediği ${sonuc.sahipsizIptal} açık emir iptal edildi.`,
      temiz ? 'Botlar sayfasında Başlat\'a basabilirsiniz (kendiliğinden başlamaz).' : `Başlat kapalı: ${String(neden).slice(0, 200)} — Botlar sayfasındaki fark listesine bakın.`
    ]);
    return { durum: 200, govde: { success: true, bot: k, temiz, neden, sonuc } };
  }

  /* ── NÖBET: bildirim ve çalışırken izleme ── */

  /** Ulaşılabilen her SUNUCU eşine "bu bot artık bende" (devralınan eş dahil denenir). → [{ kimlik, ad, sonuc }] */
  async function nobetBildirGonder(k, nb, kaynak) {
    const ben = o.ben();
    const out = [];
    for (const es of sunucuEsleri()) {
      const jeton = o.eslesme.gidenJeton(es.kimlik);
      if (!jeton) { out.push({ kimlik: es.kimlik, ad: es.ad, sonuc: 'jeton-yok' }); continue; }
      try {
        const r = await istemci.istek(es.adres, '/api/makine/nobet-bildir', { method: 'POST', ben: ben.kimlik, jeton, fetchFn: o.fetchFn, zamanAsimiMs: 6000,
          govde: { protokol: protokol.MAKINE_PROTOKOL, surum: String(o.surum()), kimlik: ben.kimlik, bot: k, nobet: nb, makine: ben.kimlik, kaynak: kaynak || null, zaman: zaman() } });
        const v = r.govde && protokol.dogrula('nobetBildirYanit', r.govde);
        out.push({ kimlik: es.kimlik, ad: es.ad, sonuc: r.durum === 200 && v && v.ok ? r.govde.sonuc : r.durum === 404 ? 'eski-surum' : r.durum === 409 && r.govde && r.govde.sonuc ? r.govde.sonuc : `hata-${r.durum}` });
      } catch (e) { out.push({ kimlik: es.kimlik, ad: es.ad, sonuc: 'ulasilamadi' }); }
    }
    return out;
  }

  const izleniyor = new Set();
  const alarmlar = new Map();   // bot → son alarm anahtarı (aynı nöbet için tek alarm)
  /** Karar uygula: önce kayıt (yerel kural hemen her bağlantıyı kapatır), sonra çalışıyorsa DURDUR (pozisyon/emir kapatılmaz). */
  function uygula(k, karar, esK, kaynakMetin) {
    const ad = (B.bilgi(k) || {}).adGorunen || k;
    if (karar.kod === 'cakisma-kazandi') {
      const a = `${karar.kod}:${esK}:${karar.devret ? karar.devret.nobet : ''}`;
      if (alarmlar.get(k) !== a) { alarmlar.set(k, a); log('ERROR', `🛟 ${karar.metin}`); bildir('alarm', `${ad}: iki makine aynı botun sahibi (bölünmüş beyin)`, [karar.metin, `Kaynak: ${kaynakMetin}.`]); }
      return { bot: k, kod: karar.kod, durduruldu: false };
    }
    const calisiyordu = !!B.calisiyorMu(k);
    B.sahipYaz(k, karar.devret);
    try { if (B.bekleyenCikar) B.bekleyenCikar(k); } catch { /* */ }
    let durdurma = null;
    if (calisiyordu) { durdurma = Promise.resolve().then(() => B.durdur(k)).catch(e => log('ERROR', `🛟 ${k}: nöbet devrinde durdurma tamamlanamadı: ${e.message}`)); }
    const a = `${karar.kod}:${karar.devret.makine}:${karar.devret.nobet}`;
    log(calisiyordu ? 'ERROR' : 'WARN', `🛟 ${karar.metin}${calisiyordu ? ' — bot ÇALIŞIYORDU, durduruldu' : ''} (${kaynakMetin})`);
    if (alarmlar.get(k) !== a) {
      alarmlar.set(k, a);
      bildir('alarm', `${ad} bu makinede durduruldu — başka makinede devralınmış`, [
        `${esAd(karar.devret.makine)} bu botun daha yeni nöbetini taşıyor (nöbet ${karar.devret.nobet}). Aynı bot iki makinede emir göndermesin diye bu makinedeki kopya ${calisiyordu ? 'DURDURULDU' : 'artık başlamaz'} (açık pozisyon ve emirlere dokunulmadı).`,
        `Kaynak: ${kaynakMetin}. Bot ${esAd(karar.devret.makine)} makinesinde devam eder; geri getirmek için oradan bu bilgisayara taşıyın.`
      ]);
    }
    return { bot: k, kod: karar.kod, durduruldu: calisiyordu, durdurma };
  }

  /** Eşin özeti geldi (nabız gelen / giden yanıtı): bu makinedeki botlardan daha yeni nöbeti eşte olan varsa durdur + devret. */
  function nobetIzle(esK, ozet) {
    if (o.rol() !== 'sunucu' || !ozet || !Array.isArray(ozet.botlar)) return [];
    const ben = o.ben().kimlik;
    const out = [];
    for (const x of ozet.botlar) {
      const k = x && x.kimlik;
      if (!BOT_RE.test(String(k || '')) || izleniyor.has(k)) continue;
      const yb = B.bilgi(k);
      if (!yb || yb.motor !== 'bindirme') continue;
      const karar = nobetLib.calisanKarar({ yerel: { kimlik: k, nobet: yb.nobet, makine: yb.makine }, ben, es: esK, esBot: x });
      if (!karar) continue;
      izleniyor.add(k);
      try { out.push(uygula(k, karar, esK, `${esAd(esK)} nabız özeti`)); } catch (e) { log('ERROR', `🛟 ${k}: nöbet kararı uygulanamadı: ${e.message}`); } finally { izleniyor.delete(k); }
    }
    return out;
  }

  /** POST /api/makine/nobet-bildir (makine kademesi): eş "bu bot artık bende, nöbet n" diyor. @returns { durum, govde } */
  function nobetBildirAl(g, gonderen) {
    const v = protokol.dogrula('nobetBildir', g);
    if (!v.ok) return { durum: 400, govde: { success: false, error: `nöbet bildirimi geçersiz: ${v.hatalar.slice(0, 3).join('; ')}` } };
    if (g.kimlik !== gonderen || g.makine !== gonderen) return { durum: 403, govde: { success: false, error: 'bildirimdeki kimlik / sahip jetonun kimliğiyle aynı değil (makine yalnız kendi nöbetini bildirir)' } };
    if (protokol.uyum(g.protokol) !== 'tam') return { durum: 409, govde: { success: false, error: 'makine protokolü farklı — iki makineyi aynı sürüme güncelleyin' } };
    if (!Number.isInteger(g.nobet) || g.nobet < 1) return { durum: 400, govde: { success: false, error: 'nöbet geçersiz' } };
    const ben = o.ben().kimlik;
    const yanit = (sonuc, durduruldu = false, durumKodu = 200) => ({ durum: durumKodu, govde: { success: durumKodu === 200, protokol: protokol.MAKINE_PROTOKOL, kimlik: ben, bot: g.bot, sonuc, nobet: Number((B.bilgi(g.bot) || {}).nobet) || 0, durduruldu } });
    const yb = B.bilgi(g.bot);
    if (!yb || yb.motor !== 'bindirme') return yanit('yok');
    if (izleniyor.has(g.bot)) return yanit('zaten');
    const karar = nobetLib.calisanKarar({ yerel: { kimlik: g.bot, nobet: yb.nobet, makine: yb.makine }, ben, es: gonderen, esBot: { kimlik: g.bot, nobet: g.nobet, makine: g.makine, calisiyor: true } });
    if (!karar) {
      const n = Number(yb.nobet) || 0;
      if (yb.makine === gonderen && n >= g.nobet) return yanit('zaten');
      if (n > g.nobet || (n === g.nobet && yb.makine && yb.makine !== gonderen)) return yanit('daha-yeni', false, 409);
      return yanit('zaten');
    }
    if (karar.kod === 'cakisma-kazandi') { uygula(g.bot, karar, gonderen, `${esAd(gonderen)} nöbet bildirimi`); return yanit('daha-yeni', false, 409); }
    izleniyor.add(g.bot);
    let r;
    try { r = uygula(g.bot, karar, gonderen, `${esAd(gonderen)} nöbet bildirimi`); } finally { izleniyor.delete(g.bot); }
    return yanit('devredildi', !!(r && r.durduruldu));
  }

  /**
   * Nöbet ara katmanı ek kapısı (server.js → makineUclari.nobetKapisi): devralınan DEMO botta sahiplen onayına kadar Mutabakat / Kuru /
   * Başlat / Çalıştır kapalı (onaysız kol mutabakatı borsadaki emirleri "sahipsiz" iptal ederdi; sayaç da korunmazdı). Acil serbest.
   */
  function kapi(k, islem) {
    if (!['mutabakat', 'kuru', 'baslat', 'calistir'].includes(islem)) return null;
    const t = botDurum(k);
    if (!devralmaMi(t) || t.mod !== 'demo' || !SAHIPLEN_BEKLER.includes(t.mutabakat || 'bekliyor')) return null;
    return { kod: 'devralma-sahiplen', metin: 'Bu demo bot başka makineden DEVRALINDI: önce Ayarlar › Makineler › Devralma\'da borsadaki emir listesini görüp onaylayın (sahiplen). Onaydan sonra Mutabakat ve Başlat açılır. Acil durdurma serbest.' };
  }

  return { liste, devral, sahiplenListe, sahiplen, nobetBildirAl, nobetBildirGonder, nobetIzle, kapi, kagitMutabakat, suruyor: () => suruyor, _alarmlar: alarmlar };
}

module.exports = { olustur, sonTemas, sessizlikEngeli, kopyaBotlari, devralinabilirMi, yeniNobet, listeOzeti, satirEtkisi,
  YETENEK, SESSIZ_ESIK_MS, KOPYA_PAY_MS, ESKI_KOPYA_MS, ONAY, SAHIPLEN_ONAY, LISTE_TAVAN };
