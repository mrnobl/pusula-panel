'use strict';
/**
 * A4 — CANLI HESAP AKTARIM KAPISI (saf) — TASARIM-MAKINE-HESAP-BOT §8.2 "gerçek aktarım kapısı kapalı gelir; açılması kullanıcının ayrı
 * ve yazılı kararıdır"; §11 karar #12: canlı hesap kapısıyla (2027-01-05 sonrası, G1–G9) birlikte, AYRI onayla.
 * ═══════════════════════════════════════════════════════════════════════════
 * Kapı kapalıyken aktarım yalnız PROVA kipinde çalışır (sahte borsa — para hareketi yok, botlara dokunulmaz). Canlı kip için HEPSİ:
 *   A-DOSYA   <veri>/live/aktarim-kapisi.json { acik: true, tarih: 'YYYY-AA-GG' (≥ 2027-01-05), gerekce, onay: 'ALT HESAP AKTARIMINI AC' }
 *             — yalnız sunucu bilgisayarında `npm run aktarim-kapisi -- --ac --gerekce "…"` yazar (panelden / config'ten AÇILAMAZ)
 *   A-GENEL   canlı hesap kapısının genel şartları: araştırma modu değil (K-MOD), tarih ≥ 2027-01-05 (K-TARIH), G1–G9 yazılı onayı (K-ONAY)
 *   (hizmet ayrıca: aktarım anahtarı kayıtlı + çekme izni KAPALI (her aktarımdan önce borsadan), bot taraflar canlı hesapta ve o botun
 *    canlı hesap kapısı açık, borsa bağdaştırıcısı hazır)
 */
const CK = require('../live/canliKapi');

const ONAY_METNI = 'ALT HESAP AKTARIMINI AC';
const GENEL_KODLAR = new Set(['K-MOD', 'K-TARIH', 'K-ONAY']);

/**
 * @param o { simdi, dosya: aktarim-kapisi.json içeriği | null, kapilar: canli-kapilar.json içeriği | null, arastirma }
 * @returns { izin, eksikler: [{ kod, metin }] }
 */
function denetle(o = {}) {
  const eksikler = [];
  const d = o.dosya && typeof o.dosya === 'object' ? o.dosya : null;
  if (!d || d.acik !== true) eksikler.push({ kod: 'A-DOSYA', metin: 'canlı hesap aktarımı kapalı (varsayılan) — açılması ayrı ve yazılı karar: sunucuda `npm run aktarim-kapisi -- --ac`' });
  else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.tarih || '')) || d.tarih < CK.CANLI_EN_ERKEN) eksikler.push({ kod: 'A-DOSYA', metin: `aktarım kapısı onayının tarihi geçersiz ya da ${CK.CANLI_EN_ERKEN} öncesi` });
    if (String(d.onay || '') !== ONAY_METNI) eksikler.push({ kod: 'A-DOSYA', metin: 'aktarım kapısı dosyasında onay metni yok' });
    if (!(typeof d.gerekce === 'string' && d.gerekce.trim().length >= 10)) eksikler.push({ kod: 'A-DOSYA', metin: 'aktarım kapısı dosyasında gerekçe yok (en az 10 harf)' });
  }
  const g = CK.denetle({ simdi: o.simdi || Date.now(), ad: 'aktarim', tavan: 1, kapilar: o.kapilar || null, anahtarVar: true, saglikUrl: 'x', digerCanli: [], arastirma: !!o.arastirma });
  for (const e of g.eksikler) if (GENEL_KODLAR.has(e.kod)) eksikler.push({ kod: 'A-GENEL', metin: e.metin });
  return { izin: eksikler.length === 0, eksikler };
}

/** Dosya içeriği (script yazar). */
function dosyaOlustur({ simdi = Date.now(), gerekce }) {
  return { acik: true, tarih: new Date(simdi).toISOString().slice(0, 10), gerekce: String(gerekce || '').trim().slice(0, 300), onay: ONAY_METNI, zaman: new Date(simdi).toISOString() };
}

module.exports = { denetle, dosyaOlustur, ONAY_METNI };
