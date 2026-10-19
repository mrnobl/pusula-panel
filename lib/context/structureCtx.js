/**
 * YAPI BAĞLAMI — salınım · range · dalga (`PLAN-GRID-DCA.md` §4.2, F3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `swings`, `structure_state` ve `ranges` çıktılarının TEK nesnede toplanmış
 * hâli. Strateji dört ayrı göstergeyi ayrı ayrı okumaz; "yapı ne durumda"
 * sorusunun tek bir cevabı olur.
 *
 *   swingUst, swingAlt          son onaylı salınım uçları
 *   swingUstYas, swingAltYas    kaç bar önce OLUŞTU
 *   swingUstOnayYas,
 *   swingAltOnayYas             kaç bardır BİLİNİYOR
 *   yapiDurumu                  'HH' | 'HL' | 'LH' | 'LL' — ilk salınımlarda
 *                               karşılaştıracak öncül olmadığı için 'H' / 'L'
 *   rangeVar, rangeUst,
 *   rangeAlt, rangeEq           varsa aktif range
 *   dalgaYonu, dalgaYasi,
 *   dalgaBoyu                   fiyat dalgası (boy ATR cinsinden)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OLUŞUM BARI ≠ ONAY BARI
 * ═══════════════════════════════════════════════════════════════════════════
 * Bir salınım zirvesi `index` barında OLUŞUR ama `confirmedAt` barında
 * BİLİNİR — ölçülen örnekte 48'de oluşup 60'ta onaylanıyor, 12 bar sonra.
 *
 * İleriye bakmayı önleyen şey, serinin ONAY barından önce `null` olmasıdır;
 * havuz bunu zaten yapıyor (ölçüldü: `lastHigh[]` tam 60'ta değişiyor, 48'de
 * değil). Bu maskeleme yerinde olduğu sürece YAŞ iki türlü de ölçülebilir ve
 * ikisi de dürüsttür:
 *
 *   i − index        salınım kaç bar önce OLUŞTU
 *   i − confirmedAt  kaç bardır BİLİYORUZ
 *
 * `swingUstYas`/`swingAltYas` OLUŞUM yaşını taşır: "bu zirve 5 barlık mı 60
 * barlık mı" stratejinin sorduğu sorudur, ve havuzun `lastHighIndex[]`
 * çıktısı zaten tam olarak bu sayıyı veriyor — ikinci bir türetme olmuyor.
 * Onay gecikmesi `swingUstOnayYas`/`swingAltOnayYas` ile ayrıca açılıyor,
 * çünkü "daha yeni onaylandı" ile "çoktan biliniyordu" farklı şeylerdir.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BU MODÜL YENİDEN HESAPLAMAZ, BİRLEŞTİRİR
 * ═══════════════════════════════════════════════════════════════════════════
 * Salınım tespiti, range çizimi ve yapı durumu göstergelerin işi. Burada
 * ikinci bir gerçekleme olsaydı iki kopya kaçınılmaz olarak ayrışırdı —
 * bu depoda `htfTopla`nın iki kopyası tam olarak böyle ayrışmıştı. Bitti
 * ölçütü de bu yüzden "mevcut göstergelerin çıktısıyla birebir uyum".
 */

const havuz = require('../indicatorPool');

const atrBol = (fark, atr) => (Number.isFinite(atr) && atr > 0 ? fark / atr : null);

/**
 * @param {Array}  mumlar
 * @param {object} p
 *   atrPeriod        ATR periyodu (varsayılan 14)
 *   swingAtrMultiple salınım eşiği
 *   swingLookback    salınım pivot penceresi
 *   rangeWidthAtr    range genişlik eşiği
 *   rangeMinBars     range en az kaç bar
 */
function yapiBaglami(mumlar, p = {}) {
  const n = Array.isArray(mumlar) ? mumlar.length : 0;
  const bosDizi = () => new Array(n).fill(null);
  const sonuc = {
    swingUst: bosDizi(), swingAlt: bosDizi(),
    swingUstYas: bosDizi(), swingAltYas: bosDizi(),
    swingUstOnayYas: bosDizi(), swingAltOnayYas: bosDizi(),
    yapiDurumu: bosDizi(),
    rangeVar: bosDizi(), rangeUst: bosDizi(), rangeAlt: bosDizi(), rangeEq: bosDizi(),
    dalgaYonu: bosDizi(), dalgaYasi: bosDizi(), dalgaBoyu: bosDizi(),
    warmup: 0
  };
  if (!n) return sonuc;

  const atrPeriod = p.atrPeriod || 14;
  const atr = havuz.computeOne(mumlar, 'atr', { period: atrPeriod }).value;

  const sw = havuz.computeOne(mumlar, 'swings', {
    atrMultiple: p.swingAtrMultiple,
    lookback: p.swingLookback
  });
  const rg = havuz.computeOne(mumlar, 'ranges', {
    atrPeriod, widthAtr: p.rangeWidthAtr, minBars: p.rangeMinBars
  });

  /**
   * Onay takvimi: her salınım noktası ONAYLANDIĞI bara yazılır.
   *
   * `points` zaman sıralı gelse de `confirmedAt` sırası `index` sırasından
   * farklı olabilir (geç onaylanan bir zirve, erken onaylanan bir dipten
   * sonra gelebilir). Bu yüzden takvim `confirmedAt`e göre kuruluyor.
   */
  const takvim = new Array(n);
  for (const nokta of (sw.points || [])) {
    const onay = Number.isFinite(nokta.confirmedAt) ? nokta.confirmedAt : nokta.index;
    if (!Number.isFinite(onay) || onay < 0 || onay >= n) continue;
    if (!takvim[onay]) takvim[onay] = [];
    takvim[onay].push(nokta);
  }

  let sonZirve = null;   // { fiyat, onay, label }
  let sonDip = null;
  let sonNokta = null;   // en son onaylanan (zirve ya da dip)

  const warmup = atrPeriod + 1;
  sonuc.warmup = warmup;

  for (let i = 0; i < n; i++) {
    for (const nokta of (takvim[i] || [])) {
      const kayit = {
        fiyat: nokta.price,
        olusum: Number.isFinite(nokta.index) ? nokta.index : i,
        onay: i,
        label: nokta.label || null,
        tip: nokta.type
      };
      if (nokta.type === 'high') sonZirve = kayit; else sonDip = kayit;
      sonNokta = kayit;
    }

    if (i < warmup) continue;

    if (sonZirve) {
      sonuc.swingUst[i] = sonZirve.fiyat;
      sonuc.swingUstYas[i] = i - sonZirve.olusum;
      sonuc.swingUstOnayYas[i] = i - sonZirve.onay;
    }
    if (sonDip) {
      sonuc.swingAlt[i] = sonDip.fiyat;
      sonuc.swingAltYas[i] = i - sonDip.olusum;
      sonuc.swingAltOnayYas[i] = i - sonDip.onay;
    }

    /**
     * Yapı durumu, EN SON ONAYLANAN salınımın etiketidir. `swings`
     * göstergesi HH/HL/LH/LL'i kendisi hesaplıyor; burada yeniden
     * türetmek ikinci bir gerçekleme olurdu.
     *
     * İlk zirve ve ilk dip 'H' / 'L' etiketi taşır — kıyaslanacak bir
     * öncül yok. Bunları 'HH'/'LL'ye YUVARLAMIYORUZ: strateji "yükselen
     * zirve" görürken elde yalnızca "bir zirve" olurdu.
     */
    if (sonNokta && sonNokta.label) sonuc.yapiDurumu[i] = sonNokta.label;

    // ── Range ────────────────────────────────────────────────────────
    const icinde = rg.inRange && rg.inRange[i];
    const ust = rg.rangeHigh && rg.rangeHigh[i];
    const alt = rg.rangeLow && rg.rangeLow[i];
    const rangeGecerli = !!icinde && Number.isFinite(ust) && Number.isFinite(alt);
    sonuc.rangeVar[i] = rangeGecerli ? 1 : 0;
    if (rangeGecerli) {
      sonuc.rangeUst[i] = ust;
      sonuc.rangeAlt[i] = alt;
      // Denge çizgisi: kutunun ortası. Range'in kendi çıktısında yok,
      // ama grid'in merkezi tam olarak burası olacak.
      sonuc.rangeEq[i] = (ust + alt) / 2;
    }

    // ── Dalga ────────────────────────────────────────────────────────
    /**
     * Dalga, son onaylanan salınıma göre tanımlanır: en son onaylanan uç
     * bir ZİRVEyse fiyat ona doğru yükselmiştir (yön +1), DİPse düşmüştür.
     *
     * Yaş, salınımın OLUŞUMUNDAN sayılır — `swingUstYas` ile aynı birim
     * olsun diye. İkisi farklı barlardan sayılsaydı "dalga 3 barlık ama
     * zirve 15 barlık" gibi kendi içinde çelişen bir bağlam çıkardı.
     *
     * Boy, iki uç arasındaki mesafedir ve O ANKİ ATR'ye bölünür — okunduğu
     * andaki oynaklığa göre. Dalganın oluştuğu andaki ATR'ye bölmek
     * "şu an bu dalga ne kadar büyük" sorusunu cevaplamazdı.
     */
    if (sonNokta && sonZirve && sonDip) {
      sonuc.dalgaYonu[i] = sonNokta.tip === 'high' ? 1 : -1;
      sonuc.dalgaYasi[i] = i - sonNokta.olusum;
      const boy = atrBol(Math.abs(sonZirve.fiyat - sonDip.fiyat), atr && atr[i]);
      if (boy !== null) sonuc.dalgaBoyu[i] = boy;
    }
  }

  return sonuc;
}

module.exports = { yapiBaglami };
