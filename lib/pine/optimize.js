/**
 * PINE PARAMETRELERİ İÇİN OPTİMİZASYON IZGARASI
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN OTOMATİK IZGARA TEHLİKELİ VE NASIL EHLİLEŞTİRİLİR
 * ─────────────────────────────────────────────────────────────────────────
 * Elle yazılmış stratejiler ızgaralarını kendileri bildiriyor. İçe aktarılan
 * bir Pine botunun böyle bir bildirimi yok; ızgara olmadan optimizatör TEK
 * kombinasyon koşuyor ve "çalıştı ama hiçbir şey denemedi" sonucunu veriyor.
 *
 * Ama şemadan gözü kapalı ızgara üretmek daha kötüsüdür. 14 parametreli bir
 * DCA botunda parametre başına 3 değer = 4.7 MİLYON kombinasyon. Optimizatör
 * bunu 150 örneğe indirir ve o 150 örnek uzayı temsil etmez — sonuç "en iyi"
 * diye sunulan rastgele bir noktadır.
 *
 * Deponun kaydında bunun bedeli yazılı: `sigmoid_bb` için 2300 kombinasyon
 * arandı, bulunan her şey örneklem dışında çöktü.
 *
 * BU YÜZDEN IZGARA BİLİNÇLİ OLARAK KÜÇÜK:
 *   · En çok `AZAMI_PARAMETRE` (4) parametre değişir.
 *   · Parametre başına en çok 3 değer.
 *   · Üst sınır 3^4 = 81 kombinasyon — hepsi GERÇEKTEN denenir, örneklenmez.
 *
 * Hangi 4 parametre? Kullanıcı seçtiyse onunki (`__optimizeParams`), yoksa
 * şemadaki İLK sayısal parametreler. Pine yazarları girdileri önem sırasına
 * koyar; bu bir tahmindir ve kullanıcı seçimi her zaman üstündür.
 */

const AZAMI_PARAMETRE = 4;
const AZAMI_DEGER = 3;

/** Motorun kendi alanı; stratejinin mantığına ait değil, aranmaz. */
const HARIC = new Set(['allocationPct']);

const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Sayısal bir parametre için aday değerler.
 *
 * Merkez, kullanıcının O ANKİ değeridir (yoksa Pine varsayılanı): arama
 * mevcut ayarın ETRAFINDA yapılır. Sıfırdan bir uzay taramak, kullanıcının
 * bilerek seçtiği değeri kaybettirirdi.
 */
function sayisalDegerler(sema, mevcut) {
  const merkez = sayiMi(mevcut) ? mevcut : (sayiMi(sema.default) ? sema.default : null);
  if (merkez === null) return [];

  const min = sayiMi(sema.min) ? sema.min : null;
  const max = sayiMi(sema.max) ? sema.max : null;
  // Tam sayı mı? `step` 1 ya da varsayılan tamsa öyle kabul edilir.
  const tamsayi = Number.isInteger(merkez) && (!sayiMi(sema.step) || Number.isInteger(sema.step));

  let alt = merkez * 0.5;
  let ust = merkez * 1.5;
  // Merkez sıfırsa çarpma işe yaramaz; adımdan ya da sınırlardan türet.
  if (merkez === 0) {
    const adim = sayiMi(sema.step) && sema.step > 0 ? sema.step : 1;
    alt = min !== null ? min : 0;
    ust = adim;
  }

  if (min !== null) { alt = Math.max(alt, min); ust = Math.max(ust, min); }
  if (max !== null) { alt = Math.min(alt, max); ust = Math.min(ust, max); }

  let degerler = [alt, merkez, ust];
  if (tamsayi) degerler = degerler.map(v => Math.round(v));
  else degerler = degerler.map(v => +v.toFixed(6));

  // Yuvarlama sonrası çakışanlar elenir; tek değer kalırsa parametre aranmaz.
  const tekil = [...new Set(degerler)].sort((a, b) => a - b);
  return tekil.length > 1 ? tekil.slice(0, AZAMI_DEGER) : [];
}

/**
 * Şemadan ızgara üretir.
 *
 * @param {Object} paramSchema  Pine `input.*` çıkarımından gelen şema
 * @param {Object} baseConfig   kullanıcının o anki ayarları
 * @returns {{izgara: Object, secilen: string[], toplam: number, aday: string[]}}
 */
function izgaraUret(paramSchema, baseConfig = {}) {
  const sema = paramSchema || {};
  const istenen = Array.isArray(baseConfig.__optimizeParams) ? baseConfig.__optimizeParams : null;

  // 1) Her parametre için aday değerleri hesapla.
  const adaylar = [];
  for (const anahtar of Object.keys(sema)) {
    if (HARIC.has(anahtar)) continue;
    const s = sema[anahtar] || {};
    const mevcut = Object.prototype.hasOwnProperty.call(baseConfig, anahtar) ? baseConfig[anahtar] : undefined;

    let degerler = [];
    if (s.type === 'boolean') {
      degerler = [false, true];
    } else if (s.type === 'enum' && Array.isArray(s.values) && s.values.length > 1) {
      degerler = s.values.slice(0, AZAMI_DEGER);
    } else if (s.type === 'number') {
      degerler = sayisalDegerler(s, mevcut);
    }
    if (degerler.length > 1) adaylar.push({ anahtar, degerler, sayisal: s.type === 'number' });
  }

  // 2) Hangileri değişecek?
  let secilen;
  if (istenen) {
    // Kullanıcı seçimi aynen alınır; adaylıkta olmayan anahtar sessizce
    // düşürülmez — aranamayacağı belli olsun diye listede tutulmaz ama
    // `aday` alanı üzerinden panel neyin mümkün olduğunu gösterebilir.
    secilen = adaylar.filter(a => istenen.includes(a.anahtar));
  } else {
    // Varsayılan: şema sırasında ilk sayısal parametreler. Pine yazarları
    // girdileri önem sırasına koyar — bu bir TAHMİNDİR, kullanıcı seçimi üstün.
    secilen = adaylar.filter(a => a.sayisal).slice(0, AZAMI_PARAMETRE);
    if (!secilen.length) secilen = adaylar.slice(0, AZAMI_PARAMETRE);
  }
  secilen = secilen.slice(0, AZAMI_PARAMETRE);

  const izgara = {};
  let toplam = 1;
  for (const a of secilen) {
    izgara[a.anahtar] = a.degerler;
    toplam *= a.degerler.length;
  }

  return {
    izgara,
    secilen: secilen.map(a => a.anahtar),
    aday: adaylar.map(a => a.anahtar),
    toplam: secilen.length ? toplam : 0
  };
}

module.exports = { izgaraUret, AZAMI_PARAMETRE, AZAMI_DEGER, HARIC };
