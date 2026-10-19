/**
 * Gösterge arayüzü — katalog, otomatik parametre formu, gösterge listesi.
 *
 * Grafik paneli ve ayrı gösterge sayfası aynı modülü kullanır. Formlar
 * ELLE YAZILMAZ: `/api/indicators` parametreleri tipli döndürüyor
 * (number/enum/boolean, min/max/default) ve form bundan üretiliyor. 52
 * göstergenin ~250 parametresine tek tek HTML yazmak, her yeni göstergede
 * unutulacak bir adım demekti.
 *
 * DOM ile kurulur, `innerHTML` kullanılmaz — kaçışsız `innerHTML` bu depoda
 * zaten açık bir güvenlik kalemi, yenisini eklemenin anlamı yok.
 */
(function (global) {
  'use strict';

  let catalogMap = null;
  let catalogList = [];

  /**
   * Eleman kurucu ARTIK BURADA DEĞİL — `js/core/dom.js` içinde.
   *
   * Birebir aynı fonksiyonun kopyası buradaydı. Bu depoda aynı kuralın iki
   * kopyası bir kez sessizce ayrıştı (`htfTopla`: biri kovaya `time`/`volume`
   * yazıyordu, diğeri yazmıyordu). İkinci kopyayı yaşatmanın bedeli belli.
   */
  const el = (tag, props, children) => global.AG.dom.el(tag, props, children);

  async function loadCatalog(force) {
    if (catalogMap && !force) return catalogMap;
    const data = await global.AG.api.gostergeKatalogu();
    if (!data.success) throw new Error('Gösterge kataloğu alınamadı');
    catalogList = data.indicators;
    catalogMap = new Map(catalogList.map(d => [d.key, d]));
    return catalogMap;
  }

  const getCatalog = () => catalogMap || new Map();
  const getList = () => catalogList;

  /** Çizilebilir çıktılar — metadata (`info`, `matrix`…) seçenek olarak sunulmaz. */
  const drawableOutputs = (meta) =>
    Object.keys(meta.render || {}).filter(n => meta.render[n].as !== 'none');

  /**
   * Yeni gösterge için varsayılan spec.
   * Varsayılan görünür çıktılar: fiyat panelindeki çizgiler (Bollinger'ın üç
   * bandı birlikte anlamlı), yoksa ilk çizilebilir çıktı. Bir göstergenin
   * sekiz çıktısını birden açmak grafiği okunmaz hâle getirir.
   */
  function defaultSpec(meta, idSuffix) {
    const params = {};
    for (const [name, spec] of Object.entries(meta.params || {})) params[name] = spec.default;

    const drawable = drawableOutputs(meta);
    // Bot katmanında asıl istenen şey stop + işlemler + GİRİLMEYEN sinyaller;
    // bantları kullanıcı isterse açar. Fiyat çizgilerini varsayılan yapmak
    // grafiği doldurup asıl bilgiyi gölgeler.
    const bot = String(meta.key || '').startsWith('bot:');
    const fiyatCizgileri = bot
      ? drawable.filter(n => ['stop', 'bbUpper', 'entries', 'ladderTp', 'extremeExit', 'stopExit', 'trendExit', 'exits', 'blocked'].includes(n))
      : drawable.filter(n => meta.render[n].pane === 'price' && meta.render[n].as === 'line');
    const secili = fiyatCizgileri.length ? fiyatCizgileri : drawable.slice(0, 1);

    const outputs = {};
    secili.forEach((n, i) => {
      outputs[n] = { visible: true, color: global.ChartIndicators.PALETTE[i % global.ChartIndicators.PALETTE.length] };
    });

    return {
      id: `${meta.key}_${idSuffix || Math.random().toString(36).slice(2, 7)}`,
      key: meta.key,
      params,
      outputs
    };
  }

  /** Çizim türünün Türkçesi (lib/indicatorPool/aciklamalar.js CIZIM_AD ile aynı). */
  const CIZIM_AD = { line: 'çizgi', markers: 'işaret', histogram: 'sütun', boxes: 'kutu', box: 'kutu', levels: 'seviye', level: 'seviye', zones: 'bölge', area: 'alan', band: 'bant' };

  /** Tipli parametre → uygun giriş alanı. */
  function paramField(name, schema, value, onChange) {
    const wrap = el('div', { class: 'ind-field' });
    // B-33 (61.1): ekranda Türkçe etiket (lib/indicatorPool/aciklamalar.js), kod adı ipucunda; label girdiye bağlı.
    const kimlik = `indp-${name}-${(paramField.sayac = (paramField.sayac || 0) + 1)}`;
    wrap.appendChild(el('label', {
      text: schema.etiket || schema.label || name,
      title: name,
      for: kimlik,
      class: 'hint'
    }));

    let input;
    if (schema.type === 'boolean') {
      input = el('input', { type: 'checkbox', id: kimlik });
      input.checked = value === true;
      input.addEventListener('change', () => onChange(name, input.checked));
    } else if (schema.type === 'enum') {
      input = el('select', { class: 'form-control control-xxs', id: kimlik });
      (schema.values || []).forEach(v => {
        const o = el('option', { value: v, text: (schema.degerEtiketleri && schema.degerEtiketleri[String(v)]) || String(v) });
        input.appendChild(o);
      });
      input.value = value !== undefined && value !== null ? String(value) : String(schema.default);
      input.addEventListener('change', () => onChange(name, input.value));
    } else if (schema.type === 'string') {
      // Sembol adı gibi metin parametreler. Bu dal yoksa sayı alanına düşüyor,
      // `parseFloat('BTC/USDT')` NaN veriyor ve parametre hiç ayarlanamıyordu
      // (korelasyon ve SMT'nin `base` parametresi tam olarak buydu).
      input = el('input', {
        type: 'text', class: 'form-control control-xxs', id: kimlik,
        placeholder: schema.default === null || schema.default === undefined ? '(ilk sembol)' : String(schema.default),
        value: value === null || value === undefined ? '' : String(value)
      });
      input.addEventListener('change', () => onChange(name, input.value.trim() || null));
    } else if (schema.type === 'list') {
      // Liste parametreleri (killzones.zones gibi) virgülle yazılır.
      input = el('input', {
        type: 'text', class: 'form-control control-xxs', id: kimlik,
        value: Array.isArray(value) ? value.join(', ') : ''
      });
      input.addEventListener('change', () => {
        const liste = input.value.split(',').map(s => s.trim()).filter(Boolean);
        onChange(name, liste);
      });
    } else {
      input = el('input', {
        type: 'number', class: 'form-control control-xxs', id: kimlik,
        step: 'any',
        value: value !== undefined && value !== null ? value : schema.default
      });
      if (schema.min !== undefined) input.setAttribute('min', schema.min);
      if (schema.max !== undefined) input.setAttribute('max', schema.max);
      input.addEventListener('change', () => {
        const raw = parseFloat(input.value);
        onChange(name, Number.isFinite(raw) ? raw : schema.default);
      });
    }

    wrap.appendChild(input);
    return wrap;
  }

  /** Bir göstergenin tüm parametreleri için ızgara form. */
  function buildParamForm(meta, params, onChange) {
    const grid = el('div', {
      class: 'ind-param-grid'
    });
    const schema = meta.params || {};
    if (!Object.keys(schema).length) {
      grid.appendChild(el('div', { text: 'Bu göstergenin ayarlanabilir parametresi yok.', class: 'hint' }));
      return grid;
    }
    for (const [name, spec] of Object.entries(schema)) {
      grid.appendChild(paramField(name, spec, params[name], onChange));
    }
    return grid;
  }

  /** Çıktı seçici: hangi çıktılar çizilsin, hangi renkle. */
  function buildOutputPicker(meta, spec, onChange) {
    const box = el('div', { class: 'ind-output-row' });

    drawableOutputs(meta).forEach((name, i) => {
      const hint = meta.render[name];
      const mevcut = spec.outputs[name] || {};
      const satir = el('label', {
        class: 'check-label text-xs',
        title: `${hint.pane === 'price' ? 'fiyat paneli' : 'kendi paneli'} · ${CIZIM_AD[hint.as] || hint.as}`
      });

      const chk = el('input', { type: 'checkbox' });
      chk.checked = mevcut.visible === true;
      chk.addEventListener('change', () => {
        if (chk.checked) {
          spec.outputs[name] = {
            visible: true,
            color: mevcut.color || global.ChartIndicators.PALETTE[i % global.ChartIndicators.PALETTE.length]
          };
        } else {
          delete spec.outputs[name];
        }
        onChange();
      });

      const renk = el('input', { type: 'color', class: 'color-swatch' });
      renk.value = mevcut.color || global.ChartIndicators.PALETTE[i % global.ChartIndicators.PALETTE.length];
      renk.addEventListener('change', () => {
        if (!spec.outputs[name]) spec.outputs[name] = { visible: true };
        spec.outputs[name].color = renk.value;
        onChange();
      });

      satir.appendChild(chk);
      satir.appendChild(renk);
      satir.appendChild(el('span', { text: name }));
      // Panel rozeti: fiyat üstünde mi, altta kendi şeridinde mi.
      satir.appendChild(el('span', {
        text: hint.pane === 'price' ? '⌁' : '▁',
        // tone-muted (≥ 4,5): eski .dim (opaklık 0,6) soluk metni 2,5:1'e düşürüyordu (P5 sınaması).
        class: 'tone-muted',
        title: hint.pane === 'price' ? 'fiyat grafiğinin üstünde' : 'kendi alt panelinde'
      }));
      box.appendChild(satir);
    });

    return box;
  }

  /** Gruplandırılmış gösterge seçici. */
  function buildPicker(onPick) {
    const sel = el('select', { class: 'form-control control-xs' });
    sel.appendChild(el('option', { value: '', text: '+ Gösterge ekle…' }));

    const gruplar = {};
    getList().forEach(d => {
      if (d.multi) return; // çok sembollüler grafik panelinde değil, ayrı sayfada
      if (!gruplar[d.group]) gruplar[d.group] = [];
      gruplar[d.group].push(d);
    });

    Object.keys(gruplar).sort().forEach(g => {
      const og = el('optgroup', { label: g });
      gruplar[g].forEach(d => og.appendChild(el('option', { value: d.key, text: d.label })));
      sel.appendChild(og);
    });

    sel.addEventListener('change', () => {
      const key = sel.value;
      sel.value = '';
      if (!key) return;
      const meta = getCatalog().get(key);
      if (meta) onPick(defaultSpec(meta));
    });

    return sel;
  }

  /**
   * Gösterge listesi editörü. Ekle / çıkar / parametre düzenle / çıktı seç.
   * `onChange` her değişiklikte çağrılır — çağıran taraf yeniden hesaplar.
   */
  function mountEditor(container, specs, onChange) {
    function redraw() {
      container.textContent = '';
      container.appendChild(buildPicker(spec => {
        specs.push(spec);
        redraw();
        onChange();
      }));

      if (!specs.length) {
        container.appendChild(el('div', {
          text: 'Henüz gösterge eklenmedi.',
          class: 'hint mt-2'
        }));
        return;
      }

      specs.forEach((spec, idx) => {
        const meta = getCatalog().get(spec.key);
        if (!meta) return;

        const kart = el('div', {
          class: 'ind-card'
        });

        const baslik = el('div', { class: 'row-between' });
        baslik.appendChild(el('strong', { text: meta.label, class: 'text-sm' }));

        const dugmeler = el('div', { class: 'row gap-1' });
        // Isınma bilgisi: gösterge kaç bar sonra değer üretiyor — grafikte
        // baştaki boşluğun sebebi bu, kullanıcı merak etmesin.
        dugmeler.appendChild(el('span', {
          text: `ısınma ${meta.warmup}`,
          class: 'hint self-center'
        }));
        dugmeler.appendChild(el('button', {
          type: 'button', class: 'btn btn-secondary btn-xxs', text: '✕', 'aria-label': 'Göstergeyi kaldır',
          onclick: () => { specs.splice(idx, 1); redraw(); onChange(); }
        }));
        baslik.appendChild(dugmeler);
        kart.appendChild(baslik);

        if (meta.note) {
          kart.appendChild(el('div', {
            text: meta.note,
            class: 'param-desc'
          }));
        }

        kart.appendChild(buildOutputPicker(meta, spec, onChange));
        kart.appendChild(buildParamForm(meta, spec.params, (name, value) => {
          spec.params[name] = value;
          onChange();
        }));

        container.appendChild(kart);
      });
    }

    redraw();
    return { redraw };
  }

  global.IndicatorUI = {
    loadCatalog,
    getCatalog,
    getList,
    defaultSpec,
    drawableOutputs,
    buildParamForm,
    buildOutputPicker,
    buildPicker,
    mountEditor,
    el
  };
})(window);
