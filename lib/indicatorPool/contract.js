/**
 * Gösterge havuzu sözleşmesi.
 *
 * Havuzun varlık sebebi üç kuralı zorlamak. Üçü de bu depoda sessiz hatalara
 * yol açtığı için kod seviyesinde garanti altına alınıyor:
 *
 *  1. HİZALAMA — her seri `candles.length` uzunluğunda döner, ısınma dönemi
 *     `null` ile doldurulur. Eski katmanda `calculateADX` 200 mum için 173
 *     değer dönüyordu; indeksi kaydırmadan okuyan her kod sessizce yanlış
 *     barlara bakıyordu.
 *
 *  2. YUVARLAMA YOK — havuz ham değer üretir. `detectMarketRegime` ATR'yi
 *     `toFixed(2)` yapıyordu; DOGE'da (fiyat 0.07) ATR 0.00'a düşüyor ve
 *     stop hesabı çöküyordu. Aynı hata Grid'in kanal sınırlarında da vardı.
 *
 *  3. ISINMA BİLDİRİMİ — gösterge kaç bar sonra geçerli değer ürettiğini
 *     `warmup` ile söyler. Strateji `null` görüp tahmin etmez.
 */

/** Diziyi baştan `null` ile doldurup hedef uzunluğa getirir. */
function padStart(arr, targetLength) {
  const list = Array.isArray(arr) ? arr : [];
  if (list.length >= targetLength) return list.slice(list.length - targetLength);
  return new Array(targetLength - list.length).fill(null).concat(list);
}

/**
 * Kütüphane çıktısını (nesne dizisi) alan bazlı serilere böler ve hepsini
 * hizalar. `technicalindicators` çıktıları hizasız gelir — BollingerBands
 * 60 giriş için 41 kayıt döner.
 */
function splitAndPad(records, fields, targetLength) {
  const out = {};
  for (const field of fields) out[field] = [];

  for (const rec of (Array.isArray(records) ? records : [])) {
    for (const field of fields) {
      const v = rec ? rec[field] : null;
      out[field].push(Number.isFinite(v) ? v : null);
    }
  }

  for (const field of fields) out[field] = padStart(out[field], targetLength);
  return out;
}

/** Sayısal olmayan her şeyi `null`'a çevirir; NaN/Infinity seriye sızmasın. */
function clean(arr, targetLength) {
  const list = (Array.isArray(arr) ? arr : []).map(v => (Number.isFinite(v) ? v : null));
  return padStart(list, targetLength);
}

const isCandleArray = (c) => Array.isArray(c) && c.length > 0
  && typeof c[0] === 'object' && c[0] !== null
  && ['open', 'high', 'low', 'close'].every(k => Number.isFinite(Number(c[0][k])));

/** Mum dizisinden tek alanı çıkarır. */
const pluck = (candles, field) => candles.map(c => Number(c[field]));

/**
 * Bir gösterge tanımının sözleşmeye uyduğunu doğrular. Kayıt sırasında ve
 * testte çalışır; uymayan gösterge havuza giremez.
 */
function validateDefinition(def) {
  const hatalar = [];
  if (!def || typeof def !== 'object') return ['tanım nesne değil'];

  if (!def.key || typeof def.key !== 'string') hatalar.push('`key` zorunlu (string)');
  if (!def.label) hatalar.push('`label` zorunlu');
  if (!def.group) hatalar.push('`group` zorunlu');
  if (typeof def.compute !== 'function') hatalar.push('`compute` zorunlu (fonksiyon)');

  const kinds = ['series', 'levels', 'zones', 'events'];
  if (!kinds.includes(def.kind)) hatalar.push(`\`kind\` şunlardan biri olmalı: ${kinds.join(' | ')}`);

  if (!Array.isArray(def.outputs) || def.outputs.length === 0) hatalar.push('`outputs` zorunlu (dizi)');
  if (def.seriesOutputs && !Array.isArray(def.seriesOutputs)) hatalar.push('`seriesOutputs` dizi olmalı');
  // `sparseOutputs`: hizalı ama tasarım gereği çoğu bar null olan seriler
  // (olay işaretçileri). Hizalama zorunlu kalır, süreklilik beklenmez.
  if (def.sparseOutputs && !Array.isArray(def.sparseOutputs)) hatalar.push('`sparseOutputs` dizi olmalı');
  if (Array.isArray(def.seriesOutputs)) {
    const eksik = def.seriesOutputs.filter(s => !def.outputs.includes(s));
    if (eksik.length) hatalar.push(`\`seriesOutputs\` içindeki ${eksik.join(', ')} \`outputs\`ta yok`);
  }
  if (def.warmup != null && typeof def.warmup !== 'function' && !Number.isFinite(def.warmup)) {
    hatalar.push('`warmup` sayı veya fonksiyon olmalı');
  }

  return hatalar;
}

/**
 * Bir göstergenin ÇIKTISINI sözleşmeye göre doğrular.
 * `series` tipinde her çıktı mum dizisiyle aynı uzunlukta olmalıdır.
 */
function validateOutput(def, result, candleCount) {
  const hatalar = [];
  if (!result || typeof result !== 'object') return [`${def.key}: sonuç nesne değil`];

  // `zones`/`events` tipindeki göstergeler de hizalı türetilmiş seriler
  // sunabilir (örn. swings hem salınım noktası listesi hem `lastHigh` serisi
  // üretir). `seriesOutputs` bunları işaretler; hizalama onlarda da zorunlu.
  const seriesNames = new Set(def.kind === 'series' ? def.outputs : (def.seriesOutputs || []));

  for (const name of def.outputs) {
    if (!(name in result)) {
      hatalar.push(`${def.key}: bildirilen çıktı '${name}' sonuçta yok`);
      continue;
    }

    if (seriesNames.has(name)) {
      const seri = result[name];
      if (!Array.isArray(seri)) {
        hatalar.push(`${def.key}.${name}: seri bekleniyordu, ${typeof seri} geldi`);
      } else if (seri.length !== candleCount) {
        hatalar.push(`${def.key}.${name}: HİZASIZ — ${seri.length} değer, ${candleCount} mum`);
      } else if (seri.some(v => v !== null && !Number.isFinite(v))) {
        hatalar.push(`${def.key}.${name}: seride NaN/Infinity var (null olmalı)`);
      }
    } else {
      // Seri olmayan çıktılar: dizi (histogram), nesne (aralık bilgisi),
      // SAYI (POC gibi tek seviye) veya null olabilir. Skaler seviyeyi
      // reddetmek, `levels` tipinin varlık sebebini reddetmek olurdu.
      const v = result[name];
      const gecerli = v === null || Array.isArray(v) || typeof v === 'object' || Number.isFinite(v);
      if (!gecerli) {
        hatalar.push(`${def.key}.${name}: '${def.kind}' tipinde dizi, nesne, sayı veya null bekleniyor (${typeof v} geldi)`);
      }
    }
  }

  return hatalar;
}

module.exports = { padStart, splitAndPad, clean, pluck, isCandleArray, validateDefinition, validateOutput };
