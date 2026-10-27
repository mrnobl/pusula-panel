'use strict';
/**
 * PUSULA DOKTORU — ONARIM MOTORU (F2, 78.2 adayı). Girdi topla → kurallar (onarim.js, saf) → ortak sınırlar → GÖLGE: "yapardım" kaydı
 * | ETKİN: beyaz listedeki eylemi çağır, önce / sonra kaydı, doğrulama, 3 başarısızlıkta devret.
 * ═══════════════════════════════════════════════════════════════════════════
 * · EYLEMLERİ BU DOSYA BİLMEZ: `eylemler` nesnesini lib/sunucu/doktorUclari.js verir (beyaz liste: veri-yeniden, kayitci-yenile,
 *   yedek-yeniden, ikinci-kanal). Kural tablosunda adı olmayan eylem çağrılamaz; gölge kipte HİÇBİR eylem çağrılmaz (öz test sayar).
 * · KİP yalnız kipAyarla ile değişir; onu yalnız uçlar çağırır (etkin: bu bilgisayar + acil PIN + ONAR; gölge / kapalı: PIN'siz).
 *   Motorun kendi akışında kip değiştiren satır YOK (öz test metinden denetler).
 * · Kayıt: her karar <veri>/doktor/sicil.jsonl'a { is: 'F2', kip, kural, hedef, karar, once, sonra, neden } (tutar / sır yok).
 *   karar: yapardim (gölge) · golge-sonra (gölgede doğrulama anında: sorun kendiliğinden geçti mi) · yapildi · dogrulandi · olmadi ·
 *   atlandi (eylem bir şey başlatmadı — deneme sayılmaz) · devretti · kip · kural.
 * · Sayaçlar kalıcı (motorDurum.js — <veri>/doktor/motor.json); gölge ve etkin sayaçları AYRI (etkine geçince sayaç temiz başlar).
 * · Canlı bot kodunu require ETMEZ (K7); bot nesnelerine hiç dokunmaz.
 */
const O = require('./onarim');
const MD = require('./motorDurum');
const SC = require('./sicil');
const K = require('./kurallar');

const guvenli = (fn, vars = null) => { try { const x = fn(); return x === undefined ? vars : x; } catch { return vars; } };
const kirp = (s, n = 200) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const EYLEM_ZAMAN_ASIMI_MS = 35 * 60 * 1000;

/**
 * @param o {
 *   simdi?: () → ms, durumDosya?, sicilDosya?, log?: (seviye, metin),
 *   kaynaklar: { veri, kayitci, telegram, yedek: () → girdi | null, mesgul: () → bool, acilis: () → ms },
 *   eylemler: { [eylem kimliği]: async (hedef) → { tamam, atlandi?, ayrinti?, hata? } },
 *   bildir?: async (baslik, satirlar, { anahtar, kisitMs }) — Telegram (devret, gölge 7 gün)
 *   calisir?: () → bool  (araştırma kopyasında false: motor hiç tur atmaz)
 * }
 */
function olustur(o = {}) {
  const simdi = o.simdi || (() => Date.now());
  const k = o.kaynaklar || {};
  const eylemler = o.eylemler || {};
  const log = o.log || (() => {});
  const bildir = o.bildir || (async () => null);
  const calisir = o.calisir || (() => true);
  const dosya = o.durumDosya || MD.varsayilanYol();
  const sicilDosya = o.sicilDosya || SC.varsayilanYol();
  let d = MD.oku(dosya, simdi());
  if (!guvenli(() => require('fs').existsSync(dosya), true)) MD.yaz(d, dosya);   // ilk kurulum: gölge başlangıcı kalıcı olsun
  let sonDeg = null, sonDegZaman = 0, mesgulTur = false, sonTur = null;
  const atlamalar = {};   // anahtar → son "neden yapmadı" (yalnız bellek; panel gösterir)

  const kaydet = () => MD.yaz(d, dosya);
  const sicil = (s) => SC.ekle({ is: 'F2', ...s, z: s.z || simdi() }, sicilDosya);
  const kuralAcik = (id) => !!(d.kurallar[id] && d.kurallar[id].acik);

  function girdi() {
    return {
      veri: guvenli(() => k.veri && k.veri(), null), kayitci: guvenli(() => k.kayitci && k.kayitci(), null),
      telegram: guvenli(() => k.telegram && k.telegram(), null), yedek: guvenli(() => k.yedek && k.yedek(), null),
    };
  }
  function degerlendir(t = simdi()) {
    const r = O.degerlendir(girdi(), t);
    sonDeg = r; sonDegZaman = t;
    return r;
  }

  async function eylemCagir(r, h) {
    const fn = eylemler[r.eylem];
    if (typeof fn !== 'function') return { tamam: false, hata: `eylem tanımlı değil: ${r.eylem}` };
    let zm;
    const zaman = new Promise((coz) => { zm = setTimeout(() => coz({ tamam: false, hata: 'zaman aşımı (35 dk)' }), EYLEM_ZAMAN_ASIMI_MS); if (zm.unref) zm.unref(); });
    try { return (await Promise.race([Promise.resolve().then(() => fn(h)), zaman])) || { tamam: false, hata: 'eylem sonuç döndürmedi' }; }
    catch (e) { return { tamam: false, hata: kirp(e && e.message, 200) }; }
    finally { clearTimeout(zm); }
  }

  async function devret(r, h, s, t, neden) {
    s.devretti = t; s.yariAcik = false;
    const anahtar = `${r.kimlik}|${h.kimlik}`;
    sicil({ kip: 'etkin', kural: r.kimlik, hedef: h.kimlik, hedefAd: h.hedefAd, karar: 'devretti', neden: kirp(neden, 200), ardisik: s.ardisik, rehber: r.rehber });
    log('WARN', `🩺 Pusula Doktoru: ${r.ad} (${h.hedefAd}) art arda ${s.ardisik} kez olmadı — size devredildi (Onarım Rehberi ${r.rehber})`);
    await Promise.resolve().then(() => bildir(`Pusula Doktoru: ${r.ad} olmadı — size devredildi`, [
      `${h.hedefAd}: art arda ${s.ardisik} deneme sonuç vermedi${neden ? ` (son: ${kirp(neden, 160)})` : ''}.`,
      `Doktor bu iş için 24 saat yeniden denemeyecek. Ne yapmalı: Onarım Rehberi › ${r.rehber} (panel › Bilgi › Onarım Rehberi) ve Sistem › Sorunlar.`,
    ], { anahtar: `doktor:devret:${anahtar}`, kisitMs: O.DEVRE_MS })).catch(() => null);
  }

  async function basarisiz(r, h, s, t, neden) {
    s.ardisik = (s.ardisik || 0) + 1; s.sonBasarisiz = t;
    s.sonKarar = { z: t, karar: 'olmadi', neden: kirp(neden, 160) };
    sicil({ kip: 'etkin', kural: r.kimlik, hedef: h.kimlik, hedefAd: h.hedefAd, karar: 'olmadi', neden: kirp(neden, 200), ardisik: s.ardisik });
    if (s.ardisik >= O.ESIK_BASARISIZ || s.yariAcik) await devret(r, h, s, t, neden);
  }
  function basarili(s, t) { s.ardisik = 0; s.devretti = null; s.yariAcik = false; s.sonBasarisiz = null; s.sonKarar = { z: t, karar: 'dogrulandi' }; }

  /** Bir tur. @returns { kip, yapilan: [{ kural, hedef, karar }] } | null (atlandı) */
  async function tik() {
    if (mesgulTur || !calisir()) return null;
    mesgulTur = true;
    const yapilan = [];
    try {
      const t = simdi();
      const kip = d.kip;
      if (kip === 'kapali') { sonTur = { z: t, kip, yapilan }; return sonTur; }
      const deg = degerlendir(t);
      const sayac = d.sayac[kip] || (d.sayac[kip] = {});
      const acilis = guvenli(() => k.acilis && k.acilis(), null);
      const mesgul = guvenli(() => (k.mesgul ? !!k.mesgul() : false), null);

      // 1. Bekleyen doğrulamalar (önceki denemenin sonucu)
      for (const [anahtar, s] of Object.entries(sayac)) {
        if (!s.bekleyen || t < s.bekleyen.dogrulaZ) continue;
        const [kural, ...hp] = anahtar.split('|');
        const hedefK = hp.join('|');
        const r = O.KURAL[kural];
        const dk = deg.find(x => x.kural === kural);
        if (!r || !dk || dk.durum === 'bilinmiyor') continue;   // ölçemiyorsak karar yok — sonraki tura
        const hala = dk.hedefler.find(x => x.kimlik === hedefK);
        const h = hala || { kimlik: hedefK, hedefAd: s.bekleyen.hedefAd || hedefK };
        s.bekleyen = null;
        if (kip === 'golge') {
          s.sonKarar = { z: t, karar: 'golge-sonra', sonuc: hala ? 'suruyor' : 'gecti' };
          sicil({ kip, kural, hedef: hedefK, hedefAd: h.hedefAd, karar: 'golge-sonra', sonuc: hala ? 'suruyor' : 'gecti', sonra: hala ? hala.once : null });
          yapilan.push({ kural, hedef: hedefK, karar: 'golge-sonra' });
        } else if (!hala) {
          basarili(s, t);
          sicil({ kip, kural, hedef: hedefK, hedefAd: h.hedefAd, karar: 'dogrulandi', sonra: { durum: 'geçti' } });
          yapilan.push({ kural, hedef: hedefK, karar: 'dogrulandi' });
        } else {
          await basarisiz(r, h, s, t, `deneme sonrası ${K.sureMetni(r.dogrulaMs)} geçti, sorun sürüyor`);
          yapilan.push({ kural, hedef: hedefK, karar: 'olmadi' });
        }
      }

      // 2. Yeni kararlar
      for (const dk of deg) {
        if (dk.durum !== 'var') continue;
        const r = O.KURAL[dk.kural];
        for (const h of dk.hedefler) {
          const anahtar = `${r.kimlik}|${h.kimlik}`;
          const s = O.sayacTemizle(sayac[anahtar] || (sayac[anahtar] = O.yeniSayac()), t);
          s.hedefAd = h.hedefAd || h.kimlik;
          const kt = O.kontrol({ kural: r, hedef: h, simdi: t, sayac: s, acilis, mesgul, kip, kuralAcik: kuralAcik(r.kimlik) });
          if (!kt.izin) { atlamalar[anahtar] = { z: t, neden: kt.neden }; continue; }
          delete atlamalar[anahtar];
          s.denemeler.push(t);
          const bek = r.dogrulaMs ? { z: t, dogrulaZ: t + r.dogrulaMs, hedefAd: h.hedefAd } : null;
          if (kip === 'golge') {
            s.bekleyen = bek;
            s.sonKarar = { z: t, karar: 'yapardim' };
            sicil({ kip, kural: r.kimlik, hedef: h.kimlik, hedefAd: h.hedefAd, karar: 'yapardim', eylem: r.eylem, once: h.once || null, yariAcik: kt.yariAcik || undefined });
            yapilan.push({ kural: r.kimlik, hedef: h.kimlik, karar: 'yapardim' });
            continue;
          }
          // ETKİN
          if (kt.yariAcik) s.yariAcik = true;
          const sonuc = await eylemCagir(r, h);
          const t2 = simdi();
          if (sonuc.atlandi) {
            s.denemeler.pop();
            s.sonKarar = { z: t2, karar: 'atlandi', neden: kirp(sonuc.ayrinti || sonuc.hata, 160) };
            sicil({ kip, kural: r.kimlik, hedef: h.kimlik, hedefAd: h.hedefAd, karar: 'atlandi', eylem: r.eylem, once: h.once || null, neden: kirp(sonuc.ayrinti || sonuc.hata, 200) });
            yapilan.push({ kural: r.kimlik, hedef: h.kimlik, karar: 'atlandi' });
            continue;
          }
          if (!sonuc.tamam) {
            sicil({ kip, kural: r.kimlik, hedef: h.kimlik, hedefAd: h.hedefAd, karar: 'yapildi', eylem: r.eylem, once: h.once || null, sonra: { tamam: false, ayrinti: kirp(sonuc.ayrinti || sonuc.hata, 200) } });
            await basarisiz(r, h, s, t2, sonuc.hata || sonuc.ayrinti || 'eylem başarısız');
            yapilan.push({ kural: r.kimlik, hedef: h.kimlik, karar: 'olmadi' });
            continue;
          }
          sicil({ kip, kural: r.kimlik, hedef: h.kimlik, hedefAd: h.hedefAd, karar: 'yapildi', eylem: r.eylem, once: h.once || null, sonra: { tamam: true, ayrinti: kirp(sonuc.ayrinti, 200) } });
          log('INFO', `🩺 Pusula Doktoru: ${r.ad} — ${h.hedefAd}${sonuc.ayrinti ? ` (${kirp(sonuc.ayrinti, 120)})` : ''}`);
          if (bek) { s.bekleyen = { ...bek, z: t2, dogrulaZ: t2 + r.dogrulaMs }; s.sonKarar = { z: t2, karar: 'yapildi' }; }
          else basarili(s, t2);
          yapilan.push({ kural: r.kimlik, hedef: h.kimlik, karar: 'yapildi' });
        }
      }

      // 3. Gölge 7 gün dolunca BİR KEZ hatırlat (kip DEĞİŞMEZ — karar kullanıcının)
      const gd = O.golgeDurumu(d, t);
      if (kip === 'golge' && gd.doldu && !d.golgeHatirlatildi) {
        d.golgeHatirlatildi = true;
        const say = golgeSayilari(t);
        sicil({ kip, kural: null, hedef: null, karar: 'golge-hatirlatma', sayi: say.yapardim });
        await Promise.resolve().then(() => bildir('Pusula Doktoru: 7 günlük gölge süresi doldu — kararınız bekleniyor', [
          `Doktor ${O.GOLGE_GUN} gündür yalnız izledi: ${say.yapardim} kez "şunu yapardım" dedi${say.gecti ? `, bunların ${say.gecti} tanesinde sorun kendiliğinden geçti` : ''}. Hiçbir şey yapmadı.`,
          'Panel › Sistem › Pusula Doktoru › Onarım motoru: listeye bakın. Doğruysa bu bilgisayardan "Etkin kipe geç" (acil PIN + ONAR); değilse gölgede bırakın ya da kapatın.',
          'Pusula kipi kendisi DEĞİŞTİRMEZ.',
        ], { anahtar: 'doktor:golge-hatirlatma', kisitMs: 7 * K.GUN })).catch(() => null);
      }
      kaydet();
      sonTur = { z: t, kip, yapilan };
      return sonTur;
    } finally { mesgulTur = false; }
  }

  function golgeSayilari(t = simdi(), gun = 7) {
    const l = SC.oku(gun, sicilDosya, t).filter(x => x.is === 'F2' && x.kip === 'golge');
    return { yapardim: l.filter(x => x.karar === 'yapardim').length, gecti: l.filter(x => x.karar === 'golge-sonra' && x.sonuc === 'gecti').length,
      suruyor: l.filter(x => x.karar === 'golge-sonra' && x.sonuc === 'suruyor').length };
  }

  /** YALNIZ UÇLAR çağırır. kip: golge | etkin | kapali. @returns { kip, onceki } */
  function kipAyarla(kip, { kaynak = 'panel' } = {}) {
    if (!O.KIPLER.includes(kip)) throw new Error(`geçersiz kip: ${kip}`);
    const t = simdi();
    const onceki = d.kip;
    if (onceki === kip) return { kip, onceki, degisti: false };
    d.kip = kip; d.kipZaman = t; d.kipKaynak = kirp(kaynak, 120);
    if (kip === 'golge') { d.golgeBas = t; d.golgeHatirlatildi = false; }
    for (const s of Object.values(d.sayac[kip] || {})) s.bekleyen = null;   // eski kipten kalan doğrulama yeni kipte karar üretmesin
    kaydet();
    sicil({ kip, kural: null, hedef: null, karar: 'kip', onceki, kaynak: kirp(kaynak, 120) });
    log(kip === 'etkin' ? 'WARN' : 'INFO', `🩺 Pusula Doktoru onarım motoru: ${O.KIP_AD[onceki] || onceki} → ${O.KIP_AD[kip]} (${kirp(kaynak, 80)})`);
    return { kip, onceki, degisti: true };
  }

  /** YALNIZ UÇLAR çağırır. */
  function kuralAyarla(kimlik, acik, { kaynak = 'panel' } = {}) {
    if (!O.KURAL[kimlik]) throw new Error(`tanımsız kural: ${kimlik}`);
    const onceki = kuralAcik(kimlik);
    d.kurallar[kimlik] = { acik: !!acik, zaman: simdi() };
    kaydet();
    if (onceki !== !!acik) sicil({ kip: d.kip, kural: kimlik, hedef: null, karar: 'kural', acik: !!acik, kaynak: kirp(kaynak, 120) });
    return { kural: kimlik, acik: !!acik, onceki };
  }

  function sinirMetni(r) { return r.sinirMetni; }
  function devirler(t = simdi()) {
    const l = [];
    for (const [anahtar, s] of Object.entries(d.sayac.etkin || {})) {
      if (!s.devretti) continue;
      const [kural, ...hp] = anahtar.split('|');
      const r = O.KURAL[kural];
      if (!r) continue;
      l.push({ kural, ad: r.ad, hedef: hp.join('|'), hedefAd: s.hedefAd || hp.join('|'), z: s.devretti, ardisik: s.ardisik, rehber: r.rehber, kilavuz: r.kilavuz,
        neden: s.sonKarar && s.sonKarar.neden ? s.sonKarar.neden : null, yenidenDeneme: s.devretti + O.DEVRE_MS, yasMs: t - s.devretti });
    }
    return l.sort((a, b) => b.z - a.z);
  }

  /** Panel: kip, gölge sayacı, kurallar (durum + son karar + neden yapmadı), "şunu yapardım" listesi, etkin kayıtlar, devirler. */
  function ozet({ n = 40 } = {}) {
    const t = simdi();
    const deg = sonDeg && t - sonDegZaman < 10 * K.DK ? sonDeg : degerlendir(t);
    const gd = O.golgeDurumu(d, t);
    const kayit = SC.oku(30, sicilDosya, t).filter(x => x.is === 'F2');
    const yeni = (l) => l.slice(-n).reverse();
    const kip = d.kip;
    const sayac = d.sayac[kip] || {};
    const kurallar = O.KURALLAR.map(r => {
      const dk = deg.find(x => x.kural === r.kimlik) || { durum: 'bilinmiyor', ayrinti: '', hedefler: [] };
      const anahtarlar = Object.keys(sayac).filter(a => a.startsWith(`${r.kimlik}|`));
      const son = anahtarlar.map(a => sayac[a].sonKarar).filter(Boolean).sort((a, b) => b.z - a.z)[0] || null;
      const neden = dk.hedefler.map(h => atlamalar[`${r.kimlik}|${h.kimlik}`]).filter(Boolean).map(x => x.neden)[0] || null;
      return { kimlik: r.kimlik, ad: r.ad, acik: kuralAcik(r.kimlik), varsayilan: r.varsayilan, tetik: r.tetikMetni, eylem: r.eylemMetni, sinir: sinirMetni(r), rehber: r.rehber,
        kilavuz: `#/kilavuz/sorun-giderme/${r.kilavuz}`, durum: dk.durum, ayrinti: dk.ayrinti, hedefler: dk.hedefler.map(h => h.hedefAd || h.kimlik), sonKarar: son, bekleyen: neden };
    });
    return {
      kip, kipAd: O.KIP_AD[kip], kipZaman: d.kipZaman, kipKaynak: d.kipKaynak, calisir: !!guvenli(() => calisir(), false),
      golge: { gunSiniri: O.GOLGE_GUN, gun: gd.gun, doldu: gd.doldu, kalanGun: gd.kalanGun, bas: d.golgeBas || null, ...golgeSayilari(t) },
      kurallar,
      yapardim: yeni(kayit.filter(x => x.kip === 'golge' && (x.karar === 'yapardim' || x.karar === 'golge-sonra'))).map(satirModeli),
      etkinKayit: yeni(kayit.filter(x => x.kip === 'etkin' && ['yapildi', 'dogrulandi', 'olmadi', 'atlandi', 'devretti'].includes(x.karar))).map(satirModeli),
      kipGecmisi: yeni(kayit.filter(x => x.karar === 'kip' || x.karar === 'kural')).slice(0, 10).map(satirModeli),
      devirler: devirler(t), sinirlar: O.ORTAK_SINIRLAR, asla: O.ASLA, d8: { belirtiler: O.D8_BELIRTILER, elenen: O.D8_ELENEN },
      sonTur: sonTur ? { z: sonTur.z, sayi: sonTur.yapilan.length } : null,
      onizleme: { acikKurallar: kurallar.filter(r => r.acik).map(r => ({ kimlik: r.kimlik, ad: r.ad, eylem: r.eylem, sinir: r.sinir })),
        kapaliKurallar: kurallar.filter(r => !r.acik).map(r => ({ kimlik: r.kimlik, ad: r.ad })), sinirlar: O.ORTAK_SINIRLAR, onay: 'ONAR' },
    };
  }

  /** Sorun merkezi girdisi (lib/sunucu/sorunUclari.js → lib/sorunlar.js doktor-devretti / doktor-golge-ozeti). */
  function sorunGirdisi(t = simdi()) {
    const gd = O.golgeDurumu(d, t);
    return { kip: d.kip, golge: gd.kartGoster ? { gun: Math.floor(gd.gun), ...golgeSayilari(t) } : null, devirler: devirler(t).filter(x => x.yasMs < 3 * K.GUN) };
  }

  return { tik, kipAyarla, kuralAyarla, ozet, sorunGirdisi, degerlendir, _durum: () => d, _yenidenOku: () => { d = MD.oku(dosya, simdi()); return d; } };
}

/** Saf: sicil satırı → panel satırı. */
function satirModeli(x) {
  const r = x.kural ? O.KURAL[x.kural] : null;
  return { z: x.z, kip: x.kip, kural: x.kural || null, kuralAd: r ? r.ad : null, hedef: x.hedef || null, hedefAd: x.hedefAd || x.hedef || null, karar: x.karar,
    sonuc: x.sonuc || null, neden: x.neden || null, once: x.once || null, sonra: x.sonra || null, onceki: x.onceki || null, kaynak: x.kaynak || null, acik: x.acik, rehber: r ? r.rehber : null };
}

module.exports = { olustur, satirModeli, EYLEM_ZAMAN_ASIMI_MS };
