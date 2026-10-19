/**
 * DEAL YAŞAM DÖNGÜSÜ DEFTERİ (`PLAN-MOTOR.md` M-2)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEDEN VAR
 * ═══════════════════════════════════════════════════════════════════════════
 * `trades[]` dizisi giriş ve çıkış kayıtlarını birlikte tutar; bir "deal"in
 * nerede başlayıp nerede bittiği oradan doğrudan okunamıyordu. 2026-09-06'da
 * DCA ölçümü yapılırken deal'leri çıkarmak için SEBEP METNİ ayrıştırıldı:
 *
 *     /^DEFTER /        →  bu bir defter dolumu mu
 *     [kademe 3]        →  kaçıncı basamak
 *
 * Çalıştı ama kırılgan: emir kimliği ya da sebep metni değişse ölçüm sessizce
 * yanlış sayardı. Grid botunda — aynı anda onlarca açık seviye ve iki yön —
 * bu yöntem tamamen çöker.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ÇÖZÜM: METİN DEĞİL, ALAN
 * ═══════════════════════════════════════════════════════════════════════════
 * Motor artık her işlem kaydına YAPISAL alanlar yazıyor:
 *
 *     kind       'giris' | 'kismi' | 'kapanis' | 'acik'
 *     kaynak     'defter' | 'sinyal' | 'limit'        (yalnızca girişlerde)
 *     emirId     defter emrinin kimliği               (yalnızca defter girişi)
 *     kademe     kaçıncı dolum                        (yalnızca girişlerde)
 *     sebepKodu  'hedef' | 'stop' | 'breakeven' | 'likidasyon' | 'sinyal' |
 *                'kismi' | 'kademeStop' | 'acik'      (yalnızca çıkışlarda)
 *
 * `kademeStop` tek bir LOTUN kendi stopunda kapanmasıdır ve `kind` olarak
 * son lotta 'kapanis', öncekilerde 'kismi' taşır — defter bu yüzden onu ayrıca
 * tanımak zorunda değil, mevcut kısmi çıkış yolundan geçer.
 *     barIndex   olayın barı
 *
 * Bu defter o alanlardan deal'leri kurar. Hiçbir yerde metin okunmaz.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SIRALAMA VARSAYIMI
 * ═══════════════════════════════════════════════════════════════════════════
 * `trades` kronolojiktir. Bir deal açılış girişiyle başlar, kapanışla biter,
 * arada gelen girişler o deal'e eklenir.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEFTER YÖN BAŞINADIR (K7 — kullanıcı, 2026-09-06: HER YÖN AYRI DEAL)
 * ═══════════════════════════════════════════════════════════════════════════
 * Eskiden tek bir açık deal tutuluyordu ve bu, motor tek pozisyon taşıdığı
 * sürece doğruydu. Hedge defteriyle (M4b) artık long ve short AYNI ANDA açık
 * olabiliyor; tek slot bırakılsaydı short girişi, açık duran LONG deal'ine
 * eklenirdi. Sonuç yine üretilirdi — bir grid koşusunun bütün deal'leri
 * birbirine karışmış hâlde.
 *
 * Artık yön başına bir slot var. Tek pozisyonlu stratejilerde aynı anda tek
 * yön açık olduğu için çıktı BİREBİR aynı kalır; mutabakat bunu doğruluyor.
 */

/** Bir kaydın hangi olay olduğunu söyler. Eski kayıtlarda alan yoksa çıkarım. */
function olayTipi(t) {
  if (t.kind) return t.kind;
  // Geriye dönük emniyet: `kind` taşımayan bir kayıt gelirse sessizce
  // yanlış saymak yerine en azından giriş/çıkış ayrımını koru.
  if (t.type === 'OPEN') return 'acik';
  return t.exitPrice === undefined ? 'giris' : 'kapanis';
}

function yonBul(t) {
  if (t.direction) return t.direction;
  return t.type === 'SHORT' ? 'short' : 'long';
}

/**
 * Bir çıkışın maliyet esasını kaydın kendi sayılarından türetir.
 *
 * Motor `profitPct = profitUSDT / grossCost * 100` yazıyor, yani
 * `grossCost = profitUSDT / (profitPct/100)`. Kayıtlar 2 basamağa
 * yuvarlandığı için sonuç YAKLAŞIKTIR; yalnızca çok çıkışlı deal'lerin
 * yüzdesini birleştirmek için kullanılır, tek çıkışlı deal'de kaydın kendi
 * yüzdesi aynen alınır.
 */
function maliyetTuret(c) {
  if (!Number.isFinite(c.pnlUSDT) || !Number.isFinite(c.pnlPct) || c.pnlPct === 0) return null;
  return c.pnlUSDT / (c.pnlPct / 100);
}

function dealKapat(d) {
  const son = d.cikislar[d.cikislar.length - 1] || null;

  d.girisAdet = d.girisler.length;
  d.kademe = d.girisler.length;
  d.toplamMiktar = d.girisler.reduce((s, g) => s + (g.miktar || 0), 0);
  d.nominal = d.girisler.reduce((s, g) => s + (g.fiyat || 0) * (g.miktar || 0), 0);
  d.ortalamaGiris = son && Number.isFinite(son.girisFiyati)
    ? son.girisFiyati
    : (d.toplamMiktar > 0 ? d.nominal / d.toplamMiktar : null);

  d.kapanisBar = son ? son.bar : null;
  d.kapanisZaman = son ? son.zaman : null;
  d.omurBar = (Number.isFinite(d.acilisBar) && Number.isFinite(d.kapanisBar))
    ? d.kapanisBar - d.acilisBar : null;
  d.kapanisSebebi = son ? son.sebep : null;

  d.pnlUSDT = +d.cikislar.reduce((s, c) => s + (c.pnlUSDT || 0), 0).toFixed(2);

  if (d.cikislar.length === 1) {
    // Tek çıkış: motorun kendi yüzdesi, türetme yok.
    d.pnlPct = Number.isFinite(son.pnlPct) ? son.pnlPct : null;
    d.pnlPctTuretilmis = false;
  } else {
    const maliyetler = d.cikislar.map(maliyetTuret);
    if (maliyetler.every(m => Number.isFinite(m))) {
      const toplam = maliyetler.reduce((s, m) => s + m, 0);
      d.pnlPct = toplam > 0 ? +((d.pnlUSDT / toplam) * 100).toFixed(2) : null;
      d.pnlPctTuretilmis = true;
    } else {
      // Yüzde uydurulmaz. `pnlUSDT` her hâlükârda kesindir.
      d.pnlPct = null;
      d.pnlPctTuretilmis = false;
    }
  }

  // Emir kimlikleri ve kaynak dağılımı — grid'de "hangi seviye doldu"
  // sorusunun cevabı burada, sebep metninde değil.
  d.emirler = d.girisler.map(g => g.emirId).filter(Boolean);
  d.kaynakDagilimi = d.girisler.reduce((a, g) => {
    const k = g.kaynak || 'bilinmiyor';
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {});
  return d;
}

/**
 * İşlem kayıtlarından deal listesi kurar.
 *
 * @param {Array} trades  motorun `trades` dizisi (kronolojik)
 * @returns {Array} deal kayıtları
 */
function kur(trades = []) {
  const dealler = [];
  /** Yön başına EN ÇOK BİR açık deal — motorun hedge defteriyle aynı kural. */
  const acikYon = { long: null, short: null };
  let sayac = 0;

  for (const t of trades) {
    const tip = olayTipi(t);
    const yon = yonBul(t);
    let acik = acikYon[yon] || null;

    if (tip === 'giris') {
      if (!acik) {
        sayac++;
        acik = {
          id: `deal-${sayac}`,
          yon,
          acilisBar: Number.isFinite(t.barIndex) ? t.barIndex : null,
          acilisZaman: t.entryTime || null,
          girisler: [],
          cikislar: [],
          acikKaldi: false
        };
        acikYon[yon] = acik;
      }
      acik.girisler.push({
        bar: Number.isFinite(t.barIndex) ? t.barIndex : null,
        zaman: t.entryTime || null,
        fiyat: t.entryPrice,
        miktar: t.amount,
        kaynak: t.kaynak || null,
        emirId: t.emirId || null,
        kademe: t.kademe || acik.girisler.length + 1
      });
      continue;
    }

    /**
     * O YÖNDE açık deal olmadan çıkış gelemez. Eskiden kontrol yönsüzdü;
     * hedge'de bu, short kapanışının açık LONG deal'ine yazılması demekti.
     */
    if (!acik) continue;

    if (tip === 'kismi') {
      acik.cikislar.push({
        bar: Number.isFinite(t.barIndex) ? t.barIndex : t.exitIndex,
        zaman: t.exitTime || null,
        fiyat: t.exitPrice,
        miktar: t.amount,
        oran: t.oran || null,
        girisFiyati: t.entryPrice,
        pnlUSDT: t.profitUSDT,
        pnlPct: t.profitPct,
        sebep: t.sebepKodu || 'kismi',
        tur: 'kismi'
      });
      continue;
    }

    if (tip === 'kapanis') {
      acik.cikislar.push({
        bar: Number.isFinite(t.barIndex) ? t.barIndex : t.exitIndex,
        zaman: t.exitTime || null,
        fiyat: t.exitPrice,
        miktar: t.amount,
        oran: 1,
        girisFiyati: t.entryPrice,
        pnlUSDT: t.profitUSDT,
        pnlPct: t.profitPct,
        sebep: t.sebepKodu || 'bilinmiyor',
        tur: 'tam'
      });
      dealler.push(dealKapat(acik));
      acikYon[yon] = null;
      continue;
    }

    if (tip === 'acik') {
      // Koşu bitti, pozisyon hâlâ açık. Mark-to-market değeri kaydın
      // kendisinde; deal "kapandı" sayılmaz ama listede DURUR — dışarıda
      // bırakmak sonucu sistematik olarak iyimser yapardı.
      acik.acikKaldi = true;
      acik.cikislar.push({
        bar: Number.isFinite(t.barIndex) ? t.barIndex : null,
        zaman: null,
        fiyat: t.markPrice,
        miktar: t.amount,
        oran: 1,
        girisFiyati: t.entryPrice,
        pnlUSDT: t.profitUSDT,
        pnlPct: t.profitPct,
        sebep: 'acik',
        tur: 'markToMarket'
      });
      dealler.push(dealKapat(acik));
      acikYon[yon] = null;
    }
  }

  // Ne kapanış ne de açık kaydı gelen bir deal kalırsa (olmamalı) yutma.
  for (const yon of ['long', 'short']) {
    if (acikYon[yon]) dealler.push(dealKapat(acikYon[yon]));
  }

  return dealler;
}

/** Rapor künyesi — panelde ve ölçüm betiklerinde tek bakışta okunur. */
function ozet(dealler = []) {
  if (!dealler.length) {
    return { adet: 0, acikKalan: 0, ortKademe: null, ortOmur: null, sebepler: {} };
  }
  const omurler = dealler.map(d => d.omurBar).filter(Number.isFinite);
  const sebepler = dealler.reduce((a, d) => {
    const s = d.kapanisSebebi || 'bilinmiyor';
    a[s] = (a[s] || 0) + 1;
    return a;
  }, {});
  return {
    adet: dealler.length,
    acikKalan: dealler.filter(d => d.acikKaldi).length,
    ortKademe: +(dealler.reduce((s, d) => s + d.kademe, 0) / dealler.length).toFixed(2),
    ortOmur: omurler.length ? +(omurler.reduce((s, v) => s + v, 0) / omurler.length).toFixed(1) : null,
    enUzunOmur: omurler.length ? omurler.reduce((a, b) => (b > a ? b : a), -Infinity) : null,
    sebepler
  };
}

module.exports = { kur, ozet };
