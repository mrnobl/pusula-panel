const { validateDefinition } = require('./contract');
const { resolveRender } = require('./render');
const A = require('./aciklamalar');

/**
 * Gösterge kaydı. Havuza giren her tanım sözleşmeden geçer — geçmeyen
 * kaydedilmez, sessizce bozuk bir gösterge dolaşıma girmez.
 */
const definitions = new Map();

function register(def) {
  const hatalar = validateDefinition(def);
  if (hatalar.length) {
    throw new Error(`Gösterge '${def && def.key}' sözleşmeye uymuyor: ${hatalar.join('; ')}`);
  }
  if (definitions.has(def.key)) {
    throw new Error(`Gösterge anahtarı zaten kayıtlı: ${def.key}`);
  }
  definitions.set(def.key, def);
  return def;
}

const get = (key) => definitions.get(key) || null;
const has = (key) => definitions.has(key);
const keys = () => Array.from(definitions.keys());
const all = () => Array.from(definitions.values());

/**
 * Panelde/keşifte kullanılacak özet — kod okumadan havuzda ne var görülsün.
 *
 * Grafik katmanı ve gösterge sayfası bu çıktıdan beslenir: parametreler tipli
 * olduğu için form OTOMATİK üretilir (53 göstergeye elle form yazmak
 * sürdürülemez), `render` her çıktının nereye çizileceğini söyler.
 */
function describe() {
  return all().map(d => ({
    key: d.key,
    label: d.label,
    group: d.group,
    kind: d.kind,
    multi: d.multi === true,
    outputs: d.outputs,
    seriesOutputs: d.seriesOutputs || (d.kind === 'series' ? d.outputs : []),
    sparseOutputs: d.sparseOutputs || [],
    // B-33 (61.1): Türkçe etiket + seçenek değerlerinin Türkçesi (sunum; hesaplamaya dokunmaz).
    params: Object.fromEntries(Object.entries(d.params || {}).map(([ad, spec]) => [ad, {
      ...spec, etiket: A.paramEtiket(ad, spec),
      ...(Array.isArray(spec.values) ? { degerEtiketleri: Object.fromEntries(spec.values.map(v => [String(v), A.DEGER_AD[v] || String(v)])) } : {})
    }])),
    aciklama: A.aciklama(d.key),
    grupAd: A.GRUP_AD[d.group] || d.group,
    turAd: A.TUR_AD[d.kind] || d.kind,
    dependsOn: d.dependsOn || [],
    warmup: warmupOf(d, resolveParams(d, {})),
    render: resolveRender(d),
    note: d.note || null
  }));
}

/** Parametreleri tanımdaki varsayılanlarla birleştirir. */
function resolveParams(def, params = {}) {
  const out = {};
  const schema = def.params || {};
  for (const [name, spec] of Object.entries(schema)) {
    const verilen = params[name];
    out[name] = (verilen === undefined || verilen === null) ? spec.default : verilen;
  }
  // Şemada olmayan parametreler de geçirilir: gösterge içi ayarlar kısıtlanmasın.
  for (const [name, value] of Object.entries(params)) {
    if (!(name in out)) out[name] = value;
  }
  return out;
}

function warmupOf(def, params) {
  if (typeof def.warmup === 'function') return def.warmup(params) || 0;
  if (Number.isFinite(def.warmup)) return def.warmup;
  return 0;
}

module.exports = { register, get, has, keys, all, describe, resolveParams, warmupOf };
