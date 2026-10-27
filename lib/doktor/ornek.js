'use strict';
/**
 * PUSULA DOKTORU — ÖRNEK yanıt (yalnız kılavuz görüntüsü: scripts/kilavuz-ekran.js SORUN_ORNEK=1 iken GET /api/doktor?ornek=1).
 * Gerçek veri DEĞİL: Sorun merkezinin örnek girdisi (lib/sorunlar.js ornekGirdi) + uydurma onarım satırları; tutar yok. SAF.
 */
const K = require('./kurallar');
const HZ = require('./hazir');
const OG = require('./onarimGunlugu');

function yanit(simdi = Date.now(), gun = 7) {
  const SORUN = require('../sorunlar');
  const sorunlar = (SORUN.uret(SORUN.ornekGirdi(simdi)).sorunlar || []).slice(0, 2);
  const hazir = HZ.hesapla({ simdi, rol: 'sunucu', surec: { surum: 'örnek', uptimeSn: 30 * 3600, denetleyici: true }, oz: { sonYoklama: simdi - 3 * 60e3 },
    botlar: [
      { ad: 'hucum', adGorunen: 'Kairos', mod: 'demo', calisiyor: true, yurutucu: { durum: 'AKTIF' }, sonKarar: { gun: '', zaman: simdi - 9 * 3600e3 }, kalpDurumu: { saat: 9, gecikti: false } },
      { ad: 'denge', adGorunen: 'Tao', mod: 'kagit', calisiyor: true, guvenliKip: { metin: 'borsa bakımı (10 dk önce … 15 dk sonra)' }, yurutucu: { durum: 'AKTIF' }, sonKarar: { gun: '', zaman: simdi - 9 * 3600e3 }, kalpDurumu: { saat: 9, gecikti: false } },
    ] });
  const t = K.teshis({ simdi, rol: 'sunucu', sorunlar, hazir, gunlukler: [{ ad: 'sunucu-konsol.log', boyut: 23.4 * 1048576 }, { ad: 'supervisor.log', boyut: 0.2 * 1048576 }],
    artiklar: { sayi: 0, genc: 0 }, kilitler: [] });
  const s = (dk) => simdi - dk * 60e3;
  const olaylar = [
    { z: s(40), kaynak: 'oz-denetim', ozet: 'Öz denetim · internet: düzeldi', ayrinti: 'internet kesintisi 22 dk sürdü', kimlik: 'o1' },
    { z: s(95), kaynak: 'bot-alarm', bot: 'denge', ozet: 'Güvenli kip: günlük karar ertelendi (oz:bakim)', ayrinti: 'borsa bakımı', kimlik: 'o2' },
    { z: s(600), kaynak: 'oz-denetim', ozet: 'Öz denetim · kilit: kendisi onardı', ayrinti: 'sahipsiz güncelleme kilidi silindi', kimlik: 'o3' },
    { z: s(1500), kaynak: 'acilis', ozet: 'Pusula açıldı', kimlik: 'o4' },
    { z: s(3000), kaynak: 'guncelleme', ozet: 'Güncelleme 77.9: GERİ ALINDI', ayrinti: 'açılış sağlığı yanıt vermedi', kimlik: 'o5' },
  ];
  const gunluk = [
    { t: new Date(s(1490)).toISOString(), m: '[hucum] açılış bağlantısı 3. denemede kuruldu', b: 'Kairos' },
    { t: new Date(s(2200)).toISOString(), m: 'Tao: Yürütücü otomatik mutabakatla AKTIF (önceki: 418 geri çekilme)', b: 'Tao' },
  ];
  const sicil = [{ z: s(1501), is: 'D1', dosya: 'sunucu-konsol.log', sonuc: 'dondu', boyutMetin: '21,3 MB' }];
  const r = OG.birlestir({ olaylar, gunluk, sicil, bas: simdi - gun * K.GUN, botBul: (m) => ({ Kairos: 'hucum', Tao: 'denge', hucum: 'hucum' })[m] || null });
  const bakim = { gunlukler: [{ ad: 'sunucu-konsol.log', boyut: 23.4 * 1048576 }, { ad: 'supervisor.log', boyut: 0.2 * 1048576 }], artiklar: { sayi: 0, genc: 0 }, kilitler: [],
    sonDondurme: sicil[0], sonTemizlik: null, esik: { gunlukMB: K.ESIK.gunlukBayt / 1048576, kopya: K.ESIK.gunlukKopya, artikSaat: 24 }, yasakSaat: false };
  return { ornek: true, rol: 'sunucu', surum: 'örnek', ...t, bakim, hazir, onarim: { gun, ...r, bugun: r.satirlar.length }, onarimTurleri: K.ONARIM_TURLERI, sinirlar: K.SINIRLAR,
    motor: motorOrnek(simdi) };
}

/** 78.2 onarım motoru ÖRNEĞİ (gölge, 3. gün; uydurma "yapardım" satırları — gerçek veri değil). SAF. */
function motorOrnek(simdi = Date.now()) {
  const O = require('./onarim');
  const { satirModeli } = require('./motor');
  const s = (dk) => simdi - dk * 60e3;
  const kayit = [
    { z: s(50), is: 'F2', kip: 'golge', kural: 'D5', hedef: 'akis:okx', hedefAd: 'Tasfiye akışı (OKX)', karar: 'yapardim', once: { saat: 6.4 } },
    { z: s(400), is: 'F2', kip: 'golge', kural: 'D4', hedef: 'veri:tefas', hedefAd: 'TEFAS fonları', karar: 'golge-sonra', sonuc: 'gecti' },
    { z: s(445), is: 'F2', kip: 'golge', kural: 'D4', hedef: 'veri:tefas', hedefAd: 'TEFAS fonları', karar: 'yapardim', once: { hata: 'HTTP 503', veriGunu: '2026-10-24' } },
  ].map(satirModeli);
  const kurallar = O.KURALLAR.map(r => ({ kimlik: r.kimlik, ad: r.ad, acik: r.varsayilan, varsayilan: r.varsayilan, tetik: r.tetikMetni, eylem: r.eylemMetni, sinir: r.sinirMetni, rehber: r.rehber,
    kilavuz: `#/kilavuz/sorun-giderme/${r.kilavuz}`, durum: r.kimlik === 'D5' ? 'var' : 'yok', ayrinti: r.kimlik === 'D5' ? 'Tasfiye akışı (OKX) (6,4 sa)' : 'sorun yok', hedefler: [],
    sonKarar: r.kimlik === 'D5' ? { z: s(50), karar: 'yapardim' } : r.kimlik === 'D4' ? { z: s(400), karar: 'golge-sonra' } : null, bekleyen: r.kimlik === 'D5' ? 'önceki deneme doğrulanıyor' : null }));
  return { kip: 'golge', kipAd: O.KIP_AD.golge, kipZaman: s(3 * 1440), kipKaynak: 'ilk kurulum (varsayılan gölge)', calisir: true,
    golge: { gunSiniri: O.GOLGE_GUN, gun: 3, doldu: false, kalanGun: 4, bas: s(3 * 1440), yapardim: 2, gecti: 1, suruyor: 0 },
    kurallar, yapardim: kayit, etkinKayit: [], kipGecmisi: [], devirler: [], sinirlar: O.ORTAK_SINIRLAR, asla: O.ASLA, d8: { belirtiler: O.D8_BELIRTILER, elenen: O.D8_ELENEN },
    sonTur: { z: s(5), sayi: 1 }, onizleme: { acikKurallar: kurallar.filter(r => r.acik).map(r => ({ kimlik: r.kimlik, ad: r.ad, eylem: r.eylem, sinir: r.sinir })),
      kapaliKurallar: kurallar.filter(r => !r.acik).map(r => ({ kimlik: r.kimlik, ad: r.ad })), sinirlar: O.ORTAK_SINIRLAR, onay: 'ONAR' } };
}

module.exports = { yanit, motorOrnek };
