/**
 * PORTFÖYÜM — OTOMATİK MEVDUAT FAİZİ (sürüm 64.2, PLAN-PORTFOYUM P6; kullanıcı kararı 2026-10-15 "otomatik")
 * ═══════════════════════════════════════════════════════════════════════════
 * Hesabın faiz ayarı (`hesap-faiz` kaydı: yıllık brüt oran %, vade gün, stopaj %, vade başlangıcı, vade sonunda yenile)
 * varsa her BİTEN vadenin faizi bir "faiz" işlemi olarak eklenir. Kayıtlar DOSYAYA YAZILMAZ — her yüklemede kayıtlardan
 * türetilir (depo.denetle), bu yüzden:
 *   · aynı vade iki kez eklenmez (kimlik belirlenimci: of-<hesap>-<vade sonu>; aynı girdi = aynı kayıt — idempotent),
 *   · telefon (salt okuma) da aynı faizi görür, hiçbir GET dosyaya yazmaz,
 *   · kullanıcı bir otomatik faizi silerse (işlem defterinde "İptal et" → `duzeltme` hedef of-…) o kimlik "silinenler"
 *     listesine girer (D.otoFaizIptal) ve bir daha eklenmez; bakiyeye ve sonraki vadelerin anaparasına da katılmaz.
 *
 * Hesap (bir vade için, hesabın ana para biriminde — hesap.para):
 *   anapara = vade boyunca (başlangıç günü sonu → vade sonundan önceki gün) hesaptaki o para birimindeki NAKİT bakiyenin
 *             EN DÜŞÜĞÜ (vade ortasında yatırılan para o vadede faiz almaz; çekilen para anaparadan düşer)
 *   brüt    = anapara × oran/100 × vadeGun/365   (kuruşa yuvarlanır — TR mevduatında gün/365)
 *   stopaj  = brüt × stopaj/100                   (kuruşa yuvarlanır)
 *   işlem   = { islem:'faiz', tarih: vade sonu, tutar: brüt, vergi: stopaj } → muhasebe NET'i (brüt − stopaj) nakde ekler.
 * Vade sonunda yenile = EVET: bir sonraki vade aynı gün başlar ve anaparası eklenen net faizi de içerir (bileşik).
 * HAYIR: yalnız ilk vadenin faizi işler; vade bitince para vadesiz kalır (faiz yok) — bankadaki "yenileme yok" davranışı.
 * Gelecek yok: yalnız vade sonu ≤ bugün olan vadeler. Kapalı hesapta kapanıştan sonra biten vade yok.
 * Aynı hesaba yeni bir ayar girilirse önceki ayar yeni ayarın vade başlangıcında biter (o güne kadar bitmemiş vade
 * bozulmuş sayılır — faiz yok); oran 0 = o günden sonra faiz yok.
 */
'use strict';
const M = require('./model');

const GUN = 864e5;
const EN_COK_VADE = 5000;
const kurus = (x) => Math.round(x * 100) / 100;
const gunEkle = (g, n) => M.msGun(M.gunMs(g) + n * GUN);

/**
 * Bir hesap için vade listesi (saf). bakiye(g) = g günü sonundaki nakit (ham muhasebe + önceki otomatik net faizler).
 * Döndürür: [{ bas, son, anapara, brut, stopajTutar, net, ayar }]
 */
function vadeler(ayarlar, ops) {
  const { bugun, kapanis, bakiyeAdimlari } = ops;
  const elleFaiz = ops.elleFaiz || [];   // denetim 64.2: bu hesaba ELLE girilmiş faiz işlemlerinin tarihleri
  const out = [];
  const krediler = [];   // { tarih, net } — bu hesabın daha önce eklenen (silinmemiş) otomatik net faizleri
  const iptal = ops.iptal || new Set();
  const hesapId = ops.hesap;
  const bakiye = (g) => {
    let b = 0;
    for (const [t, x] of bakiyeAdimlari) { if (t > g) break; b = x; }
    for (const k of krediler) if (k.tarih <= g) b += k.net;
    return b;
  };
  const enDusuk = (bas, son) => {
    let m = bakiye(bas);
    for (const [t] of bakiyeAdimlari) if (t > bas && t < son) m = Math.min(m, bakiye(t));
    return m;
  };
  for (let i = 0; i < ayarlar.length; i++) {
    const a = ayarlar[i];
    const sinir = i + 1 < ayarlar.length ? ayarlar[i + 1].vadeBaslangic : null;   // sonraki ayar bu günden itibaren geçerli
    if (!(a.oran > 0)) continue;
    let bas = a.vadeBaslangic;
    for (let n = 0; n < EN_COK_VADE; n++) {
      const son = gunEkle(bas, a.vadeGun);
      if (son > bugun) break;
      if (sinir && son > sinir) break;
      if (kapanis && son > kapanis) break;
      const anapara = kurus(enDusuk(bas, son));
      // Denetim 64.2: vadenin (bas, son] aralığında elle girilmiş faiz varsa o vadenin faizi ELLE sayılır — otomatik
      // üretilmez (iki kez sayılmasın); çağıran uyarı yazar. Elle faiz zaten nakitte, bileşik doğal olarak devam eder.
      const elle = elleFaiz.find(g => g > bas && g <= son);
      if (elle) out.push({ id: `of-${hesapId}-${son}`, bas, son, ayar: a, elleTarih: elle, atlandi: true });
      else if (anapara > 0) {
        const brut = kurus(anapara * a.oran / 100 * a.vadeGun / 365);
        const stopajTutar = kurus(brut * a.stopaj / 100);
        if (brut >= 0.01) {
          const v = { id: `of-${hesapId}-${son}`, bas, son, anapara, brut, stopajTutar, net: kurus(brut - stopajTutar), ayar: a };
          out.push(v);
          if (!iptal.has(v.id)) krediler.push({ tarih: son, net: v.net });
        }
      }
      if (!a.yenile) break;
      bas = son;
    }
  }
  return out;
}

/**
 * D (durumKur) + ham muhasebe (otomatik faizsiz) → otomatik faiz işlemleri (silinenler dahil; `_iptal` işaretli değil —
 * çağıran D.iptalEdilen'e bakar). Döndürür: [işlem kaydı].
 */
function otoFaizUret(D, muh, bugun) {
  const out = [];
  D.otoFaizUyarilari = [];
  if (!D.faizAyarlari || !D.faizAyarlari.size) return out;
  let sira = D.sonSira || 0;
  for (const [hid, ayarlar] of D.faizAyarlari) {
    const hs = D.hesaplar.get(hid);
    if (!hs) continue;
    const etkin = ayarlar.filter(a => !D.iptalEdilen.has(a.id));
    if (!etkin.length) continue;
    const c = muh.ciftler.get(M.ciftAnahtari(hid, hs.para, true));
    const adimlar = c ? c.adimlar : [];
    const elleFaiz = D.islemler.filter(x => x.islem === 'faiz' && x.hesap === hid && !x.otomatik && (x.para || hs.para) === hs.para).map(x => x.tarih).sort();
    const l = vadeler(etkin, { bugun, kapanis: hs.durum === 'kapali' ? hs.kapanis : null, bakiyeAdimlari: adimlar, iptal: D.iptalEdilen, hesap: hid, elleFaiz });
    const sonAyar = etkin[etkin.length - 1];
    // Denetim 64.2: faiz ayarı var ama ayarın para biriminde nakit yok → faiz işlemiyor (sessiz kalmasın).
    const bakiyeSon = adimlar.length ? adimlar[adimlar.length - 1][1] : 0;
    if (sonAyar.oran > 0 && hs.durum === 'acik' && !(bakiyeSon > 0)) {
      D.otoFaizUyarilari.push({ kod: 'faiz-nakit-yok', hesap: hid, mesaj: `${hs.ad}: hesapta ${hs.para === 'TRY' ? 'TL' : hs.para} nakit yok — faiz işlenmiyor (mevduatı bu hesaba ${hs.para} nakit olarak girin: açılış ya da para yatırma)` });
    }
    for (const v of l) {
      if (v.atlandi) {
        D.otoFaizUyarilari.push({ kod: 'faiz-elle', hesap: hid, id: v.id, mesaj: `${hs.ad}: ${v.bas} → ${v.son} vadesinin faizi elle girilmiş — otomatik faiz eklenmedi (elle faiz ${v.elleTarih})` });
        continue;
      }
      sira += 1;
      const yuzde = (x) => String(x).replace('.', ',');
      out.push({
        tur: 'islem', islem: 'faiz', id: v.id, tarih: v.son, hesap: hid, para: hs.para, tutar: v.brut, vergi: v.stopajTutar, sira, zaman: null,
        otomatik: true, faizAyar: v.ayar.id, anapara: v.anapara, vadeBas: v.bas,
        not: `Otomatik mevduat faizi: ${v.bas} → ${v.son} (${v.ayar.vadeGun} gün), anapara ${M.PARA_SIMGE[hs.para] || ''}${v.anapara.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, yıllık %${yuzde(v.ayar.oran)}, stopaj %${yuzde(v.ayar.stopaj)}`
      });
    }
  }
  return out;
}

/** Ayar gövdesi (form/HTTP) → hesap-faiz kaydı (sayılar Türkçe biçimden çözülür; bozuk alan NaN kalır, bicimDenetle yakalar). */
function ayarNormalle(hesap, b) {
  const s = (x) => (x === undefined || x === null || String(x).trim() === '' ? NaN : M.sayi(x));
  const yenile = b.yenile === true || b.yenile === 'true' || b.yenile === '1' || b.yenile === 'on' || b.yenile === 'evet';
  return { tur: 'hesap-faiz', hesap: String(hesap || ''), oran: s(b.oran), vadeGun: Number.isFinite(s(b.vadeGun)) ? s(b.vadeGun) : NaN, stopaj: b.stopaj === '' || b.stopaj == null ? 0 : s(b.stopaj),
    vadeBaslangic: String(b.vadeBaslangic || '').trim(), yenile };
}

/** Bir hesabın bir sonraki (henüz bitmemiş) vadesi — ekranda "sıradaki faiz" bilgisi. */
function siradakiVade(ayar, bugun) {
  if (!ayar || !(ayar.oran > 0)) return null;
  let bas = ayar.vadeBaslangic;
  for (let n = 0; n < EN_COK_VADE; n++) {
    const son = gunEkle(bas, ayar.vadeGun);
    if (son > bugun) return { bas, son };
    if (!ayar.yenile) return null;
    bas = son;
  }
  return null;
}

module.exports = { otoFaizUret, vadeler, ayarNormalle, siradakiVade, _ic: { gunEkle, kurus } };
