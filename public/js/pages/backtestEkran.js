/**
 * BACKTEST EKRANI — Pusula P4 (PLAN-PANEL-PUSULA §3, §6 P4) `AG.pages.backtestEkran`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ekran ilkesi: üstte 5 ANA SAYI, altında TEK ANA GRAFİK (AG.grafik — güven bandı + kriz
 * dönemleri + al-tut gri ince çizgi + düşüş şeridi), ayrıntı KATLI ("Ayrıntılı analiz").
 * Walk-forward ve optimizasyon ayrı ALT SEKME; form ortak, düğmeler görünüme göre
 * (`section[data-bt-gorunum]` + `.bt-yalniz-kosu/-wf/-opt`, CSS'te).
 *
 *   gorunum(ad)   'kosu' | 'wf' | 'opt' — alt sekmeyi açar (sonuç gelince app.js çağırır)
 *   ozetCiz(res)  Backtester sonucu → ana sayılar + Pine fark uyarısı + ana grafik
 *   ozet(res)     saf: ekrana yazılacak metinler (test edilir)
 *
 * Eski 6 kutulu ızgara (btRes* kimlikleri) korunur ama ana sayılar 5: getiri, al-tut'a göre,
 * Sharpe, en büyük düşüş, işlem (kazanma oranı alt satırda). Kâr faktörü ve beklenti katta.
 */
(function (global) {
  'use strict';
  const AG = global.AG || (global.AG = {});
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const GORUNUMLER = ['kosu', 'wf', 'opt'];

  const tr = (x, b = 2) => (sayiMi(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b }) : '—');
  /** İşaret EKRANDA yazılan (yuvarlanmış) değerden: -0,004 → "%0,00" ("+%0,00" / "−%0,00" değil). */
  const isaret = (x, b) => { const y = Math.round(x * Math.pow(10, b)); return y > 0 ? '+' : y < 0 ? '−' : ''; };
  const yuzde = (x, b = 2) => (sayiMi(x) ? `${isaret(x, b)}%${tr(Math.abs(x), b)}` : '—');
  const dolar = (x) => (sayiMi(x) ? `${isaret(x, 2)}$${tr(Math.abs(x), 2)}` : '—');
  /** Ekranda yazılan değere göre ton (yuvarlanınca 0 görünen değer nötr — P3 dersi). */
  const ton = (x, b = 2) => (!sayiMi(x) || Math.abs(x) < Math.pow(10, -b) / 2 ? '' : x > 0 ? 'tone-success' : 'tone-danger');

  /** PINE FARK SAYAÇLARI → sade cümle. Sıfırsa uyarı yok. */
  const PINE_FARK = {
    gecikenCevirme: 'ters yön girişi bir bar gecikti (motor pozisyonu aynı barda çeviremez)',
    yoksayilanKimlik: 'aynı anda ikinci emir kimliği yok sayıldı (motor tek pozisyon taşır)',
    gevsekStop: 'stopu gevşeten strategy.exit uygulanmadı (motor stopu yalnız sıkılaştırır)',
    yoksayilanQty: 'qty yerine "pozisyon büyüklüğü (% nakit)" kullanıldı'
  };
  function pineFarklari(fark) {
    if (!fark) return [];
    return Object.keys(PINE_FARK).filter(k => fark[k] > 0).map(k => `${fark[k]} kez: ${PINE_FARK[k]}`);
  }

  /** Saf: sonuç → ekran metinleri. */
  function ozet(res) {
    const r = res || {};
    const an = r.analytics || {};
    const ret = an.returns || {};
    const getiri = sayiMi(r.totalReturnPct) ? r.totalReturnPct : null;
    const alfa = sayiMi(ret.alphaPct) ? ret.alphaPct : null;
    const bh = ret.benchmarking && sayiMi(ret.benchmarking.buyHoldPct) ? ret.benchmarking.buyHoldPct : null;
    const islem = sayiMi(r.totalTrades) ? r.totalTrades : 0;
    const acik = !!r.openTrade || (Array.isArray(r.openTradeler) && r.openTradeler.length > 0);
    return {
      getiri: { metin: yuzde(getiri), ton: ton(getiri), alt: sayiMi(r.totalProfitUSDT) ? `${dolar(r.totalProfitUSDT)} net` : '—' },
      alfa: { metin: alfa == null ? '—' : `${isaret(alfa, 2)}${tr(Math.abs(alfa), 2)} puan`, ton: ton(alfa), alt: bh == null ? 'al-tut ölçülemedi' : `al-tut ${yuzde(bh)}` },
      sharpe: { metin: sayiMi(r.sharpeRatio) ? tr(r.sharpeRatio, 2) : '—' },
      dusus: { metin: sayiMi(r.maxDrawdownPct) ? `−%${tr(Math.abs(r.maxDrawdownPct), 2)}` : '—' },
      islem: { metin: islem.toLocaleString('tr-TR'), alt: islem ? `kazanma %${tr(r.winRatePct, 1)}` : acik ? 'kapanan işlem yok — pozisyon açık' : 'işlem yok — sinyal izine bakın' },
      kf: sayiMi(r.profitFactor) ? tr(r.profitFactor, 2) : '—',
      beklenti: sayiMi(r.expectancy) ? dolar(r.expectancy) : '—',
      pine: pineFarklari(r.pineFark),
      pineMi: !!r.pineFark
    };
  }

  /**
   * ZAMAN DİLİMİ KARARI (B-25, saf). meta = katalog kaydı ({ label, zamanDilimi: { varsayilan, izinli } }).
   * stratejiDegisti = true → izinsiz dilim varsayılana çekilir; false (kullanıcı dilimi değiştirdi) → yalnız uyarı.
   * Döner { yeni: '1d' | null, uyari: '' }.
   */
  const TF_AD = { '1m': '1 dakika', '5m': '5 dakika', '15m': '15 dakika', '30m': '30 dakika', '1h': '1 saat', '2h': '2 saat', '4h': '4 saat', '6h': '6 saat', '12h': '12 saat', '1d': '1 gün', '1w': '1 hafta' };
  function zamanKarar(meta, mevcut, stratejiDegisti) {
    const z = meta && meta.zamanDilimi;
    if (!z || !Array.isArray(z.izinli) || !z.izinli.length) return { yeni: null, uyari: '' };
    if (z.izinli.includes(mevcut)) return { yeni: null, uyari: '' };
    const izinliAd = z.izinli.map(t => TF_AD[t] || t).join(' / ');
    if (stratejiDegisti) return { yeni: z.varsayilan, uyari: `Zaman dilimi ${TF_AD[z.varsayilan] || z.varsayilan} yapıldı: bu stratejinin kuralı gün cinsinden yazılı, yalnız ${izinliAd} mumla anlamlı.` };
    return { yeni: null, uyari: `⚠ Bu strateji yalnız ${izinliAd} mumla anlamlı; ${TF_AD[mevcut] || mevcut} seçimi hem yanlış sonuç verir hem iş çok uzun sürer (3 yılda yüz binlerce mum). Önerilen: ${TF_AD[z.varsayilan] || z.varsayilan}.` };
  }

  /** B-28: ilk N bar ısınma (göstergeler doluyor, işlem yok) → grafikte gri gölge. */
  const TF_MS = { '1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '2h': 72e5, '4h': 144e5, '6h': 216e5, '12h': 432e5, '1d': 864e5, '1w': 6048e5 };
  function isinmaBolgesi(res, t0) {
    const n = res && res.varsayimlar && res.varsayimlar.isinmaBar;
    const adim = TF_MS[(res && res.timeframe) || ''];
    if (!sayiMi(n) || n <= 0 || !adim || !sayiMi(t0)) return null;
    return { bas: t0, bit: t0 + n * adim, ad: `Isınma: ilk ${n.toLocaleString('tr-TR')} mum göstergeler doluyor, işlem yok` };
  }

  /** Ana grafik verisi: özsermaye + al-tut (gri) + bootstrap bandı + kriz dönemleri. */
  function grafikVerisi(res) {
    const s = res && res.analytics && res.analytics.series;
    if (!s || !Array.isArray(s.time) || !Array.isArray(s.equity) || s.time.length < 2) return null;
    const t = s.time.map(x => (typeof x === 'number' ? x : Date.parse(x)));
    const seri = s.equity.map((v, i) => ({ t: t[i], v }));
    const taban = (res.analytics.returns && res.analytics.returns.earnings && res.analytics.returns.earnings.initialCapital) || s.equity[0];
    const kiyas = Array.isArray(s.buyHold) && s.buyHold.length === s.time.length
      ? [{ ad: `Al-tut (${res.symbol || 'sembol'})`, seri: s.buyHold.map((v, i) => ({ t: t[i], v: v + taban })) }] : [];
    return {
      ad: `${res.strategyName || 'Strateji'} özsermayesi`,
      etiket: 'Strateji', birim: '$', seri, kiyas,
      bant: true, bantEtiketi: 'Aynı getiriler başka sırayla: %5–%95',
      krizler: (res.krizDonemleri || []).map(k => ({ ad: k.ad, bas: k.bas, bit: k.bit })),
      isinma: isinmaBolgesi(res, t[0]),
      dusus: true
    };
  }

  function yaz(id, metin, tonSinifi) {
    const e = bul(id);
    if (!e) return;
    e.textContent = metin;
    if (tonSinifi !== undefined) {
      e.classList.remove('tone-success', 'tone-danger');
      if (tonSinifi) e.classList.add(tonSinifi);
    }
  }

  let sonGrafik = null;
  function ozetCiz(res) {
    const o = ozet(res);
    yaz('btResProfit', o.getiri.metin, o.getiri.ton);
    yaz('btResProfitAlt', o.getiri.alt);
    yaz('btResAlpha', o.alfa.metin, o.alfa.ton);
    yaz('btResAlphaAlt', o.alfa.alt);
    yaz('btResSharpe', o.sharpe.metin);
    yaz('btResDrawdown', o.dusus.metin);
    yaz('btResTrades', o.islem.metin);
    yaz('btResWinRate', o.islem.alt);
    yaz('btResProfitFactor', o.kf);
    yaz('btResExpectancy', o.beklenti);
    const bos = bul('btBosDurum');
    if (bos) bos.classList.add('is-hidden');
    const sayilar = bul('btOzetSayilar');
    if (sayilar) sayilar.classList.remove('is-hidden');

    const pf = bul('btPineFark');
    if (pf && AG.dom) {
      const { el, doldur } = AG.dom;
      if (o.pineMi) {
        pf.classList.remove('is-hidden');
        doldur(pf, [el('div', { class: `trace-note ${o.pine.length ? 'bt-pine-not' : ''}`.trim() }, [
          el('strong', { text: o.pine.length ? 'İçe aktarılan Pine — motorla birebir değil: ' : 'İçe aktarılan Pine — motorla birebir çevrildi. ' }),
          el('span', { text: o.pine.length ? o.pine.join(' · ') : 'Fark: dolum sinyal barının kapanışında (TradingView bir sonraki barın açılışında doldurur); işlem tarihleri bir bar kayabilir.' })
        ])]);
      } else { pf.classList.add('is-hidden'); AG.dom.bosalt(pf); }
    }

    const kap = bul('btAnaGrafik');
    const veri = grafikVerisi(res);
    if (kap && AG.grafik) {
      kap.classList.toggle('is-hidden', !veri);
      if (veri) { sonGrafik = veri; AG.grafik.ana(kap, veri); }
    }
    gorunum('kosu');
    return o;
  }

  /** Alt sekme: section'ın data özniteliği CSS'te görünürlüğü sürer. */
  function gorunum(ad) {
    const g = GORUNUMLER.includes(ad) ? ad : 'kosu';
    const bolum = bul('tab-backtest');
    if (bolum) bolum.setAttribute('data-bt-gorunum', g);
    if (doc) doc.querySelectorAll('[data-bt-alt]').forEach(b => {
      const acik = b.getAttribute('data-bt-alt') === g;
      b.classList.toggle('active', acik);
      b.setAttribute('aria-selected', acik ? 'true' : 'false');
    });
    // Sonuç gelmişse boş durum kutusu gizlenir.
    const wf = bul('walkForwardPanel'), wfBos = bul('btWfBos');
    if (wf && wfBos) wfBos.classList.toggle('is-hidden', !wf.classList.contains('is-hidden'));
    const op = bul('optimizerPanel'), opBos = bul('btOptBos');
    if (op && opBos) opBos.classList.toggle('is-hidden', !op.classList.contains('is-hidden'));
    return g;
  }

  function baslat() {
    if (!doc || baslat.bitti) return;
    baslat.bitti = true;
    doc.querySelectorAll('[data-bt-alt]').forEach(b => b.addEventListener('click', () => gorunum(b.getAttribute('data-bt-alt'))));
    if (AG.sozluk && AG.sozluk.bagla) AG.sozluk.bagla(bul('tab-backtest'));
  }
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
    else baslat();
  }

  AG.pages = AG.pages || {};
  AG.pages.backtestZaman = { karar: zamanKarar, TF_AD };
  AG.pages.backtestEkran = { zamanKarar, isinmaBolgesi, ozet, ozetCiz, gorunum, grafikVerisi, pineFarklari, baslat, son: () => sonGrafik };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.backtestEkran;
})(typeof window !== 'undefined' ? window : globalThis);
