/**
 * PINE SÖZCÜK ÇÖZÜMLEYİCİ (v5 altkümesi)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN KENDİ ÇÖZÜMLEYİCİMİZ
 * ─────────────────────────────────────────────────────────────────────────
 * Pine, JavaScript'e düzenli ifadeyle çevrilebilecek bir dil DEĞİLDİR:
 * girintiye duyarlı blokları, seri semantiği (`x[1]` bir bar öncesi) ve
 * adlandırılmış argümanları var. "Satır satır replace" yaklaşımı sessizce
 * yanlış çevirir — bu depoda en kötü sonuç budur: doğru görünen yanlış
 * backtest sayıları. Bu yüzden gerçek bir çözümleyici yazılıyor ve
 * DESTEKLENMEYEN her şey AÇIKÇA REDDEDİLİYOR.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * GİRİNTİ — Python gibi, ama Pine'a özgü kuralla
 * ─────────────────────────────────────────────────────────────────────────
 * Pine blokları girintiyle açılır. Ancak parantez/köşeli parantez AÇIKKEN
 * satır sonu bir ifadeyi bitirmez; çağrı argümanları satırlara yayılabilir.
 * Bu yüzden derinlik sayacı tutulur ve derinlik > 0 iken NEWLINE üretilmez.
 *
 * SEKME KARIŞIMI: TradingView'dan kopyalanan kodda sekme ve boşluk karışık
 * gelebilir. Sekme 4 boşluğa genişletilir — tahmin değil, TradingView'ın
 * kendi düzenleyicisinin varsayılanı.
 */

const ANAHTAR = new Set([
  'if', 'else', 'for', 'to', 'by', 'while', 'switch', 'var', 'varip',
  'and', 'or', 'not', 'true', 'false', 'na', 'break', 'continue', 'return',
  'import', 'export', 'type', 'method', 'enum'
]);

/** Tip belirteçleri: `float x = 1.0` gibi bildirimlerde ad DEĞİL tip'tir. */
const TIPLER = new Set([
  'int', 'float', 'bool', 'string', 'color', 'series', 'simple', 'const', 'input',
  'line', 'label', 'box', 'table', 'array', 'matrix', 'map', 'linefill', 'polyline', 'chart'
]);

// Uzunlukları uzundan kısaya: '===' yokken '==' den önce '>=' denenmeli.
const OPERATORLER = [
  ':=', '==', '!=', '>=', '<=', '=>', '?.',
  '+', '-', '*', '/', '%', '<', '>', '=', '?', ':', '(', ')', '[', ']', ',', '.'
];

class PineHata extends Error {
  constructor(mesaj, satir, sutun) {
    super(satir ? `Satır ${satir}: ${mesaj}` : mesaj);
    this.name = 'PineHata';
    this.satir = satir || null;
    this.sutun = sutun || null;
  }
}

/**
 * Kaynağı belirteçlere ayırır.
 *
 * @returns {{tokens: Array, version: number|null}}
 */
function lex(kaynak) {
  if (typeof kaynak !== 'string') throw new PineHata('Kaynak metin olmalı');

  // Satır sonlarını normalize et; TradingView kopyalarında CRLF gelir.
  const hamSatirlar = kaynak.replace(/\r\n?/g, '\n').split('\n');

  /**
   * Satırdaki yorumu, METİN SABİTLERİNE saygı göstererek kırpar.
   * `s = "a // b"` içindeki `//` yorum değildir.
   */
  const yorumuKirp = (s) => {
    let tirnak = null;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (tirnak) {
        if (c === '\\') { k++; continue; }
        if (c === tirnak) tirnak = null;
        continue;
      }
      if (c === '"' || c === "'") { tirnak = c; continue; }
      if (c === '/' && s[k + 1] === '/') return s.slice(0, k);
    }
    return s;
  };

  /**
   * ─────────────────────────────────────────────────────────────────────
   * SATIR DEVAMI — Pine'ın kendi kuralı
   * ─────────────────────────────────────────────────────────────────────
   * Pine uzun ifadelerin satıra bölünmesine izin verir ve devam satırını
   * girintiden anlar: BLOK gövdesi 4'ün KATI kadar girintilenir, devam
   * satırı ise 4'ün katı OLMAYAN bir girinti taşır. Gerçek betiklerde çok
   * yaygın bir kalıp:
   *
   *     tp = tur == "ortalama"
   *        ? ortalamaFiyat * carpan
   *        : bazFiyat * carpan
   *
   * Bu kural olmadan ikinci satır yeni bir deyim sanılıp "Beklenmeyen ?"
   * hatası veriyordu. Birleştirme TOKENLEŞTİRMEDEN ÖNCE yapılır; yorumlar
   * kırpılmadan birleştirilirse satır ortasındaki `//` gerisini yutardı.
   */
  const satirlar = [];
  const satirNolari = [];
  for (let k = 0; k < hamSatirlar.length; k++) {
    const ham = hamSatirlar[k].replace(/\t/g, '    ');
    const govde = yorumuKirp(ham);
    const doluMu = govde.trim().length > 0;

    // `//@version=` yönergesi ve boş/yorum satırları olduğu gibi geçer.
    if (!doluMu || /^\s*\/\/\s*@version/.test(ham)) {
      satirlar.push(ham); satirNolari.push(k + 1);
      continue;
    }

    const girinti = govde.length - govde.replace(/^ +/, '').length;
    const devamMi = girinti > 0 && girinti % 4 !== 0 && satirlar.length > 0
      && yorumuKirp(satirlar[satirlar.length - 1]).trim().length > 0;

    if (devamMi) {
      satirlar[satirlar.length - 1] = yorumuKirp(satirlar[satirlar.length - 1]) + ' ' + govde.trim();
    } else {
      satirlar.push(ham); satirNolari.push(k + 1);
    }
  }

  let version = null;
  const tokens = [];
  const girintiYigin = [0];
  let derinlik = 0;          // açık ( ve [ sayısı
  let bekleyenGirinti = true; // satır başında mıyız

  const ekle = (tip, deger, satir, sutun) => tokens.push({ tip, deger, satir, sutun });

  for (let s = 0; s < satirlar.length; s++) {
    // Hata mesajları KAYNAK satır numarasını göstermeli; birleştirme sonrası
    // dizi indeksi kaynakla artık örtüşmüyor.
    const satirNo = satirNolari[s] || (s + 1);
    const ham = satirlar[s];

    // `//@version=5` derleyici yönergesi — yorum gibi görünür ama bilgi taşır.
    const vEsl = ham.match(/^\s*\/\/\s*@version\s*=\s*(\d+)/);
    if (vEsl) { version = parseInt(vEsl[1], 10); continue; }

    // Sekmeleri genişlet (girinti ölçümü tutarlı olsun diye).
    const satir = ham.replace(/\t/g, '    ');

    // Yalnızca boşluk ya da yorum olan satır: girintiyi ETKİLEMEZ.
    // (Python'daki kuralın aynısı; blok içindeki boş satır bloğu kapatmamalı.)
    const govdeVarMi = satir.replace(/\/\/.*$/, '').trim().length > 0;
    if (!govdeVarMi) continue;

    let i = 0;
    if (derinlik === 0) {
      // Girinti ölçümü yalnızca yeni bir mantıksal satır başlarken yapılır.
      while (i < satir.length && satir[i] === ' ') i++;
      const girinti = i;
      const tepe = girintiYigin[girintiYigin.length - 1];
      if (girinti > tepe) {
        girintiYigin.push(girinti);
        ekle('INDENT', girinti, satirNo, 1);
      } else if (girinti < tepe) {
        while (girintiYigin.length > 1 && girintiYigin[girintiYigin.length - 1] > girinti) {
          girintiYigin.pop();
          ekle('DEDENT', girinti, satirNo, 1);
        }
        if (girintiYigin[girintiYigin.length - 1] !== girinti) {
          throw new PineHata('Girinti hizası tutarsız', satirNo, girinti + 1);
        }
      }
      bekleyenGirinti = false;
    }

    while (i < satir.length) {
      const c = satir[i];

      if (c === ' ') { i++; continue; }

      // Yorum: satırın kalanı atılır.
      if (c === '/' && satir[i + 1] === '/') break;

      // Metin sabiti — Pine hem ' hem " kabul eder.
      if (c === '"' || c === "'") {
        const tirnak = c;
        let j = i + 1, deger = '';
        while (j < satir.length && satir[j] !== tirnak) {
          if (satir[j] === '\\' && j + 1 < satir.length) {
            const n = satir[j + 1];
            deger += n === 'n' ? '\n' : n === 't' ? '\t' : n;
            j += 2;
          } else {
            deger += satir[j];
            j++;
          }
        }
        if (j >= satir.length) throw new PineHata('Kapanmayan metin sabiti', satirNo, i + 1);
        ekle('STRING', deger, satirNo, i + 1);
        i = j + 1;
        continue;
      }

      // Renk sabiti: #rrggbb ya da #rrggbbaa
      if (c === '#') {
        const m = satir.slice(i).match(/^#[0-9a-fA-F]{6,8}/);
        if (!m) throw new PineHata('Geçersiz renk sabiti', satirNo, i + 1);
        ekle('COLOR', m[0], satirNo, i + 1);
        i += m[0].length;
        continue;
      }

      // Sayı: 12, 1.5, .5, 1e6
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(satir[i + 1] || ''))) {
        const m = satir.slice(i).match(/^\d*\.?\d+(?:[eE][+-]?\d+)?/);
        ekle('NUMBER', parseFloat(m[0]), satirNo, i + 1);
        i += m[0].length;
        continue;
      }

      // Ad / anahtar kelime
      if (/[A-Za-z_]/.test(c)) {
        const m = satir.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
        const ad = m[0];
        const tip = ANAHTAR.has(ad) ? 'KEYWORD' : (TIPLER.has(ad) ? 'TYPE' : 'NAME');
        ekle(tip, ad, satirNo, i + 1);
        i += ad.length;
        continue;
      }

      // Operatör
      const op = OPERATORLER.find(o => satir.startsWith(o, i));
      if (op) {
        if (op === '(' || op === '[') derinlik++;
        if (op === ')' || op === ']') derinlik = Math.max(0, derinlik - 1);
        ekle('OP', op, satirNo, i + 1);
        i += op.length;
        continue;
      }

      throw new PineHata(`Tanınmayan karakter: ${JSON.stringify(c)}`, satirNo, i + 1);
    }

    // Parantez açıkken satır sonu ifadeyi BİTİRMEZ — argümanlar satırlara yayılabilir.
    if (derinlik === 0) {
      ekle('NEWLINE', null, satirNo, satir.length + 1);
      bekleyenGirinti = true;
    }
  }

  if (derinlik > 0) throw new PineHata('Kapanmayan parantez');

  const sonSatir = satirlar.length;
  while (girintiYigin.length > 1) { girintiYigin.pop(); ekle('DEDENT', 0, sonSatir, 1); }
  ekle('EOF', null, sonSatir, 1);

  void bekleyenGirinti;
  return { tokens, version };
}

module.exports = { lex, PineHata, ANAHTAR, TIPLER };
