/**
 * BİÇİMLEME — sayı, para, yüzde, tarih (`PLAN-MOTOR.md` §8, P2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `app.js` içinde 63 `toFixed` ve 32 `toLocaleString` çağrısı var; aynı
 * biçim on üç ayrı yerde elle yazılmış (`toLocaleString('en-US',
 * { minimumFractionDigits: 2 })`). Sonuç: aynı anlamdaki iki sayı ekranda
 * farklı görünüyor ve bir biçim kararını değiştirmek on üç yeri bulmayı
 * gerektiriyor.
 *
 * ⚠ Bu dosya BİÇİM verir, YUVARLAMA KARARI vermez. Motor tarafında öğrenilen
 * ders burada da geçerli: `toFixed` gösterim içindir, hesaba giren bir sayıyı
 * yuvarlamak için değil (`detectMarketRegime` ATR'yi `toFixed(2)` yapıp
 * DOGE'da 0'a düşürmüştü). Buradaki hiçbir fonksiyonun çıktısı geri
 * `parseFloat` edilip hesaba sokulmamalı.
 *
 * Geçersiz girdi (`null`, `undefined`, `NaN`) SESSİZCE 0 sayılmaz — yer
 * tutucu döner. "0.00" göstermek, veri gelmediğini veri gelmiş gibi
 * gösterir; bu panelde en pahalı hata türü budur.
 */
(function (global) {
  'use strict';

  const YER_TUTUCU = '--';
  const sayiMi = (n) => typeof n === 'number' && Number.isFinite(n);

  /** Binlik ayraçlı sayı. Ondalık basamak sayısı SABİTLENİR. */
  function sayi(n, basamak) {
    if (!sayiMi(n)) return YER_TUTUCU;
    const b = basamak === undefined ? 2 : basamak;
    return n.toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
  }

  /** `$1.234,56` — panelin her yerinde kullanılan para biçimi (yeni panel F6: tr-TR; eskiden en-US `$1,234.56`). */
  function para(n, basamak) {
    if (!sayiMi(n)) return YER_TUTUCU;
    return '$' + sayi(n, basamak === undefined ? 2 : basamak);
  }

  /**
   * Fiyat — 4 basamak.
   *
   * Kripto fiyatları 0.07 gibi olabiliyor ve 2 basamak onu 0.07'ye kadar
   * ezip DOGE'da anlamlı fark bırakmıyordu; bu yüzden fiyatın kendi biçimi
   * var (`toFixed(4)` panelde 9 yerde tam bunun için yazılmış).
   */
  function fiyat(n, basamak) {
    if (!sayiMi(n)) return YER_TUTUCU;
    return sayi(n, basamak === undefined ? 4 : basamak);
  }

  /** `%12,34` — panelde yüzde işareti sayının SOLUNDA yazılıyor. */
  function yuzde(n, basamak) {
    if (!sayiMi(n)) return YER_TUTUCU;
    const b = basamak === undefined ? 2 : basamak;
    return '%' + n.toFixed(b).replace('.', ',');
  }

  /** `+%3,21` / `-%1,10` — işaret önde; kâr-zarar sütunlarının biçimi. */
  function isaretliYuzde(n, basamak) {
    if (!sayiMi(n)) return YER_TUTUCU;
    const b = basamak === undefined ? 2 : basamak;
    return (n >= 0 ? '+' : '') + '%' + n.toFixed(b).replace('.', ',');
  }

  /**
   * TÜRKÇE ORAN YÜZDESİ (B-17, 61.1) — Portföy ekranlarının TEK yüzde biçimi. Girdi ORAN (0,123 → "%12,3").
   * Eksi işareti yüzdenin SOLUNDA ve U+2212: "−%4,0"; yuvarlanınca sıfır olan değer işaretsiz ("−%0,0" / "%-0,0" yok).
   * ops.isaretli: artıya "+" ekler ("+%3,2"). Veri yoksa ops.yok (varsayılan '—'). Basamak varsayılan 1.
   */
  function oranYuzde(x, basamak, ops) {
    const o = ops || {};
    if (!sayiMi(x)) return o.yok != null ? o.yok : '—';
    const b = basamak === undefined || basamak === null ? 1 : basamak;
    const m = Math.abs(x * 100).toFixed(b);
    const sifir = Number(m) === 0;
    const isaret = sifir ? '' : x < 0 ? '−' : (o.isaretli ? '+' : '');
    return isaret + '%' + m.replace('.', ',');
  }

  /** `+$12.34` / `-$5.00` — işaretli para; kâr-zarar hücreleri. */
  function isaretliPara(n, basamak) {
    if (!sayiMi(n)) return YER_TUTUCU;
    return (n >= 0 ? '+' : '-') + para(Math.abs(n), basamak);
  }

  const tarihNesnesi = (t) => {
    if (t === null || t === undefined || t === '') return null;
    const d = t instanceof Date ? t : new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  /** `07.09.2026` */
  function tarih(t) {
    const d = tarihNesnesi(t);
    if (!d) return YER_TUTUCU;
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /** `14:05` */
  function saat(t) {
    const d = tarihNesnesi(t);
    if (!d) return YER_TUTUCU;
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  /** `07.09.2026 14:05` */
  function tarihSaat(t) {
    const d = tarihNesnesi(t);
    if (!d) return YER_TUTUCU;
    return tarih(d) + ' ' + saat(d);
  }

  /**
   * Kâr-zarar için ton sınıfı — `components.css` içindeki `.tone-*`.
   *
   * Renk kararı tek yerde olsun diye burada: eşik "sıfırın üstü yeşil"dir ve
   * panelin her tablosunda aynı olmalı.
   */
  function tonSinifi(n) {
    if (!sayiMi(n)) return 'tone-muted';
    if (n > 0) return 'tone-success';
    if (n < 0) return 'tone-danger';
    return 'tone-muted';
  }

  /**
   * CSS RENGİ → TON SINIFI.
   *
   * Panelde renk kararları iki dilde yazılmış durumda: bazı yerler
   * `var(--accent-success)`, bazıları ham `#10b981`, bazıları da sunucudan
   * gelen bir renk dizesi (`lib/backtest/optimize.js` yanıta `statusColor`
   * koyuyor). İşaretleme sınıfa geçerken hepsinin AYNI eşlemeden geçmesi
   * gerekiyor — yoksa aynı tablo bir sütunda yeşil, diğerinde renksiz olur.
   *
   * Bilinmeyen renk için `null` döner: sessizce yanlış bir ton uydurmak,
   * rengi hiç vermemekten daha kötüdür.
   */
  const TON_HARITASI = {
    'var(--accent-success)': 'tone-success', '#10b981': 'tone-success',
    'var(--accent-danger)': 'tone-danger', '#ef4444': 'tone-danger',
    'var(--accent-warning)': 'tone-warning', '#f59e0b': 'tone-warning',
    'var(--accent-cyan)': 'tone-cyan', '#06b6d4': 'tone-cyan',
    'var(--accent-primary)': 'tone-primary', '#6366f1': 'tone-primary',
    'var(--text-muted)': 'tone-muted', '#9ca3af': 'tone-muted',
    'var(--text-main)': 'tone-main', '#f3f4f6': 'tone-main',
    'var(--text-strong)': 'tone-strong', '#fff': 'tone-strong', '#ffffff': 'tone-strong'
  };

  function renkTonu(renk) {
    if (!renk) return null;
    const k = String(renk).trim().toLowerCase();
    return TON_HARITASI[k] || null;
  }

  const fmt = {
    YER_TUTUCU,
    sayi, para, fiyat, yuzde, isaretliYuzde, isaretliPara, oranYuzde,
    tarih, saat, tarihSaat, tonSinifi, renkTonu
  };

  global.AG = global.AG || {};
  global.AG.fmt = fmt;

  if (typeof module !== 'undefined' && module.exports) module.exports = fmt;
})(typeof window !== 'undefined' ? window : globalThis);
