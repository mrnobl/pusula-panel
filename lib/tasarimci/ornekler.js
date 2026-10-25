/**
 * MODEL ÖRNEKLERİ — model portföylerin İKİNCİ (ve sonraki) KÂĞIT HESAPLARI (74.6, TASARIM-MAKINE-HESAP-BOT §2.6 "Model şablonları
 * (2c)", PLAN-MAKINE-HESAP-BOT a3). Nova (m-qqq-m10) · Lydia (m-bist-m10) · Simurg (m-837) için şablondan açılan örnekler.
 * ═══════════════════════════════════════════════════════════════════════════
 * Model kararları ORTAK (kararlar / günlük / dolumlar — lib/tasarimci/model.js), kâğıt hesabı AYRI:
 *   <tasarimci>/ornekler/<kimlik>/sermaye.json    örneğin girdisi (bot kaydından yansıtılır; aşağıda)
 *   <tasarimci>/ornekler/<kimlik>/kagit-akis.json sermaye değişiklikleri (yalnız eklenir; lib/tasarimci/kagit.js tikHesapla)
 *   <tasarimci>/ornekler/<kimlik>/kagit.json      kâğıt hesabın son hâli (her tikte baştan, deterministik)
 *   <tasarimci>/ornekler/<kimlik>/kagit-bildirim.json  son Telegram'a bildirilen gün (yalnız sunucu)
 * <tasarimci> = lib/tasarimci/defter.js dizini (TASARIMCI_DIZIN ya da yollar.veri('tasarimci')) — `tasarimci` KİŞİSEL (yedek, taşıma).
 *
 * TEK KAYNAK: botun kimliği, adı, şablonu, sermayesi ve arşiv durumu bot kaydında (<veri>/live/botlar/<kimlik>.json, motor 'model',
 * lib/botKayit.js). sermaye.json o kaydın tasarımcı tarafındaki YANSIMASIDIR (server.js her değişiklikte ve açılışta `yansit` ile
 * yazar) — tasarımcı tiki ALT SÜREÇTE koştuğu için bot kaydını okumaz, yalnız bu dizini tarar. Arşivli örnek tikte hesaplanmaz.
 *
 * API: liste(DF) → [{ kimlik, model, adGorunen, baslangic, arsiv, tutar, para }] · oku(DF, kimlik) · yansit(DF, kayit) → değişti mi
 *      kagitOku(DF, kimlik) · goreli(kimlik, dosya) · KIMLIK_RE · MODELLER
 */
'use strict';
const fs = require('fs');
const { MODEL } = require('./kagit');

const KIMLIK_RE = /^[a-z][a-z0-9]{1,15}$/;
const GUN_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODELLER = Object.freeze(Object.keys(MODEL));
const goreli = (kimlik, dosya) => {
  if (!KIMLIK_RE.test(String(kimlik || ''))) throw new Error(`model örneği: geçersiz kimlik ${kimlik}`);
  return `ornekler/${kimlik}/${dosya}`;
};

/** Örneğin sermaye.json'u → normal biçim | null (geçersizse null). */
function coz(kimlik, j) {
  if (!j || typeof j !== 'object' || j.kimlik !== kimlik || !MODEL[j.model]) return null;
  const x = j.modeller && j.modeller[j.model];
  const tutar = x && Number.isFinite(+x.tutar) && +x.tutar > 0 ? +x.tutar : 0;
  return { kimlik, model: j.model, adGorunen: typeof j.adGorunen === 'string' && j.adGorunen.trim() ? j.adGorunen.trim() : kimlik,
    baslangic: GUN_RE.test(String(j.baslangic || '')) ? j.baslangic : null, arsiv: !!j.arsiv, tutar, para: MODEL[j.model].para };
}
function oku(DF, kimlik) { return coz(kimlik, DF.jsonOku(goreli(kimlik, 'sermaye.json'))); }

/** Dizindeki geçerli örnekler (kimlik sırasıyla). Bozuk / tanınmayan klasör atlanır (dosyasına dokunulmaz). */
function liste(DF) {
  let adlar = [];
  try { adlar = fs.readdirSync(DF.yol('ornekler'), { withFileTypes: true }).filter(d => d.isDirectory() && KIMLIK_RE.test(d.name)).map(d => d.name).sort(); } catch (e) { return []; }
  return adlar.map(k => oku(DF, k)).filter(Boolean);
}

/**
 * Bot kaydı (motor 'model') → sermaye.json yansıması. Var olan dosyadaki EK alanlar (ör. örneğe özel kesirli / kagit ayarı) korunur.
 * İçerik aynıysa yazmaz. Döndürür true (yazıldı) | false.
 */
function yansit(DF, kayit) {
  if (!kayit || kayit.motor !== 'model' || !MODEL[kayit.model]) throw new Error('model örneği: kayıt model motorlu değil');
  const yol = goreli(kayit.kimlik, 'sermaye.json');
  const eski = DF.jsonOku(yol) || {};
  const tutar = kayit.sermaye && Number.isFinite(+kayit.sermaye.kagit) ? +kayit.sermaye.kagit : 0;
  const yeni = { ...eski, surum: 1, kimlik: kayit.kimlik, model: kayit.model, adGorunen: kayit.adGorunen || kayit.kimlik,
    baslangic: GUN_RE.test(String(kayit.baslangic || '')) ? kayit.baslangic : null, arsiv: !!kayit.arsiv,
    modeller: { [kayit.model]: { tutar, para: MODEL[kayit.model].para } }, kaynak: `live/botlar/${kayit.kimlik}.json (bot kaydı — tek kaynak; bu dosya yansımadır)` };
  if (JSON.stringify(DF.kanonik ? DF.kanonik(eski) : eski) === JSON.stringify(DF.kanonik ? DF.kanonik(yeni) : yeni)) return false;
  DF.jsonYaz(yol, yeni);
  return true;
}

function kagitOku(DF, kimlik) { try { return DF.jsonOku(goreli(kimlik, 'kagit.json')); } catch (e) { return null; } }

module.exports = { liste, oku, yansit, kagitOku, goreli, coz, KIMLIK_RE, MODELLER };
