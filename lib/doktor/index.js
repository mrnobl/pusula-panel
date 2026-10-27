'use strict';
/**
 * PUSULA DOKTORU (F1, 78.1) — motor: girdi topla → teşhis · onarım günlüğü · hazır olma · bakım (D2).
 * ═══════════════════════════════════════════════════════════════════════════
 * K1: kural tabanlı; serbest yapay zekâ ajanı YOK. K2: kendiliğinden yalnız riski artırmayan iki bakım işi (D1 açılışta — bakim.js,
 * D2 günde bir — burada `bakimTik`). F1'de EYLEM MOTORU YOK: botlara, ayarlara, emirlere, güvenli kipe, ENGEL'e hiçbir yazma yolu yok.
 * F2 (78.2 adayı): ONARIM MOTORU ayrı dosyada — motor.js (kip gölge / etkin / kapalı, kalıcı sayaç, devret) + onarim.js (saf kurallar D4 D5 D6 D7)
 * + motorDurum.js (<veri>/doktor/motor.json) + yedekKos.js (D6'nın tek alt süreç noktası). Eylemleri lib/sunucu/doktorUclari.js verir.
 * Girdi çift yapı kurmadan MEVCUT kaynaklardan okunur (`kaynaklar` işlevleri, lib/sunucu/doktorUclari.js verir): Sorun merkezi
 * (sorunlarHesapla), öz denetim görüntüsü, olay akışı, günlük, botların SALT OKUMA özetleri (ozet), veri orkestratörünün kilit durumu.
 * K7: bu klasördeki dosyaları canlı bot kodu çağırmaz; bu klasör de lib/live · lib/risk · engine · exchange'i require ETMEZ
 * (scripts/doktor-selftest.js iki yönü de denetler).
 */
const K = require('./kurallar');
const HZ = require('./hazir');
const OG = require('./onarimGunlugu');
const BK = require('./bakim');
const SC = require('./sicil');

const guvenli = (fn, vars = null) => { try { const x = fn(); return x === undefined ? vars : x; } catch { return vars; } };

/**
 * @param o {
 *   rol: () → 'sunucu'|'arastirma', simdi?: () → ms,
 *   kaynaklar: {
 *     sorunlar: () → [kart] | null           Sorun merkezi kartları (sunucuda); araştırma kopyasında []
 *     surec: () → { surum, commit, uptimeSn, denetleyici }
 *     oz: () → { sonYoklama } | null          öz denetim görüntüsünün özeti (araştırma kopyasında null)
 *     botlar: () → [hazir.botHazir girdisi]
 *     olaylar: (basMs) → [olay akışı satırı]
 *     gunluk: (saat) → [günlük satırı]
 *     kilitler: () → [{ ad, bayat, yasMs, sahip }] | null
 *     botBul: (metin) → bot kimliği | null
 *   },
 *   tmpKok?, sicilDosya?, gunlukDosyalari?: () → [{ ad, dosya }]
 * }
 */
function olustur(o = {}) {
  const k = o.kaynaklar || {};
  const simdi = o.simdi || (() => Date.now());
  const rol = () => guvenli(() => (o.rol ? o.rol() : 'sunucu'), 'sunucu');
  const onbellek = { hazir: null, hazirZaman: 0, gunluk: null, gunlukZaman: 0, gunlukSaat: 0 };
  let sonTemizlik = null;   // { z, sonuc }

  function hazir({ taze = false } = {}) {
    const t = simdi();
    if (!taze && onbellek.hazir && t - onbellek.hazirZaman < 15000) return onbellek.hazir;
    const r = HZ.hesapla({ simdi: t, rol: rol(), surec: guvenli(() => k.surec(), {}), oz: rol() === 'arastirma' ? null : guvenli(() => k.oz(), null),
      botlar: rol() === 'arastirma' ? [] : guvenli(() => k.botlar(), null) || [] });
    onbellek.hazir = r; onbellek.hazirZaman = t;
    return r;
  }

  function bakimDurumu() {
    const t = simdi();
    const dosyalar = guvenli(() => (o.gunlukDosyalari ? o.gunlukDosyalari() : BK.gunlukYollari()), null);
    const gunlukler = dosyalar ? BK.gunlukBoyutlari({ dosyalar }) : null;
    const a = guvenli(() => BK.artiklar({ simdi: t, tmpKok: o.tmpKok }), null);
    const kayit = SC.oku(30, o.sicilDosya || SC.varsayilanYol(), t);
    const son = (is) => kayit.filter(x => x.is === is).pop() || null;
    return { gunlukler, artiklar: a ? { sayi: a.adaylar.length, genc: a.genc, enEskiMs: a.adaylar.length ? Math.max(...a.adaylar.map(x => x.yasMs)) : null } : null,
      kilitler: guvenli(() => k.kilitler(), null), sonDondurme: son('D1'), sonTemizlik: son('D2') || sonTemizlik,
      esik: { gunlukMB: K.ESIK.gunlukBayt / 1048576, kopya: K.ESIK.gunlukKopya, artikSaat: K.ESIK.artikYasMs / K.SAAT },
      yasakSaat: K.yasakSaatMi(t), supervisorKorumaBitis: new Date(K.SUPERVISOR_KORUMA_BITIS).toISOString() };
  }

  /** Teşhis: Sorun merkezi kartları + Doktor kuralları (D1, D2, D3, D10). */
  function teshis() {
    const t = simdi();
    const b = bakimDurumu();
    const r = rol();
    const sorunlar = r === 'arastirma' ? guvenli(() => k.sorunlar(), []) : guvenli(() => k.sorunlar(), null);
    return { ...K.teshis({ simdi: t, rol: r, sorunlar, hazir: hazir(), gunlukler: b.gunlukler, artiklar: b.artiklar, kilitler: b.kilitler }), bakim: b };
  }

  /** Onarım günlüğü: son `gun` gün (1–30). Günlük satırları 5 dk önbellekli (dosya okuması). */
  function onarimlar(gun = 7) {
    const t = simdi();
    const g = Math.max(1, Math.min(30, Math.round(Number(gun) || 7)));
    const bas = t - g * K.GUN;
    const saat = g * 24;
    if (!onbellek.gunluk || t - onbellek.gunlukZaman > 5 * K.DK || onbellek.gunlukSaat < saat) {
      onbellek.gunluk = guvenli(() => k.gunluk(saat), []) || []; onbellek.gunlukZaman = t; onbellek.gunlukSaat = saat;
    }
    const r = OG.birlestir({ olaylar: guvenli(() => k.olaylar(bas), []) || [], gunluk: onbellek.gunluk, sicil: SC.oku(g, o.sicilDosya || SC.varsayilanYol(), t), bas, n: 300, botBul: k.botBul });
    const bugunBas = (() => { const d = new Date(t + 3 * K.SAAT); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 3 * K.SAAT; })();
    return { gun: g, ...r, bugun: r.satirlar.filter(x => x.z >= bugunBas && x.sonuc !== 'atlandi').length };
  }

  /** D2 günlük bakım: günde en çok bir kez, yasak saatte değil. @returns sonuç | null (yapılmadı) */
  function bakimTik() {
    const t = simdi();
    if (K.yasakSaatMi(t)) return null;
    const trGun = (ms) => new Date(ms + 3 * K.SAAT).toISOString().slice(0, 10);
    if (sonTemizlik && trGun(sonTemizlik.z) === trGun(t)) return null;
    const r = BK.geciciTemizle({ simdi: t, tmpKok: o.tmpKok, sicilDosya: o.sicilDosya });
    sonTemizlik = { z: t, is: 'D2', sonuc: r.durum, sayi: r.sayi };
    guvenli(() => SC.ayikla(o.sicilDosya || SC.varsayilanYol(), t));
    return r;
  }

  return { hazir, teshis, onarimlar, bakimDurumu, bakimTik, _onbellek: onbellek };
}

module.exports = { olustur, K, HZ, OG, BK, SC, ONARIM: require('./onarim'), MOTOR: require('./motor'), MD: require('./motorDurum') };
