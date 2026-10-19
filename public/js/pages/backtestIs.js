/**
 * BACKTEST İŞİ — tarih aralığı, veri kapsamı/indirme, iş ilerlemesi, rapor ekleri.
 * ═══════════════════════════════════════════════════════════════════════════
 * Sunucu: `/api/veri/kapsam`, `/api/veri/indir`, `/api/backtest/is`,
 * `/api/is/:id`, `/api/is/:id/iptal`, `/api/is/:id/islemler.csv`.
 *
 * Eskisinden farkları (2026-10-06, kullanıcı: "5000 mum saçma, tarih aralığı
 * ve olabilecek en fazla fiyat verisi"):
 *   · "mum sayısı" yerine başlangıç/bitiş tarihi; "Tümü" borsadaki ilk mumdan.
 *   · Eksik veri indirilir, ilerleme ve iptal görünür.
 *   · Koşu sunucuda iş parçacığında — panel ve canlı bot donmaz.
 *   · Borsa/piyasa seçimi CANLI AYARA YAZILMAZ (eski form yazıyordu).
 * Tüm DOM `AG.dom.el` ile kurulur.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const { el, doldur, bul } = AG.dom;
  const istek = (yol, govde) => AG.api.istek(yol, govde === undefined ? undefined : { govde });

  const TF_MS = { '1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '2h': 72e5, '4h': 144e5, '6h': 216e5, '12h': 432e5, '1d': 864e5, '1w': 6048e5 };
  const sayi = (x, b = 0) => (x == null || Number.isNaN(+x) ? '—' : (+x).toLocaleString('tr-TR', { maximumFractionDigits: b, minimumFractionDigits: b }));
  // B-27 (61.1): yüzdeler tr-TR (virgül), eksi işareti yüzde simgesinin önünde ("−%4,50"); ekranda 0 görünen eksi değer "%0,00".
  const yuzde = (x, b = 2) => {
    if (x == null || Number.isNaN(+x)) return '—';
    const y = Math.round(+x * Math.pow(10, b));
    return `${y < 0 ? '−' : ''}%${sayi(Math.abs(+x), b)}`;
  };

  /**
   * İŞLEM TÜRÜ VE SEBEBİ SADE TÜRKÇE (B-27). Motor kayıtları İngilizce kısaltma taşır (SELL, COVER,
   * "LONG KAPAT — kapanış 61234 < SMA100 60000"); ekranda okunur cümle. CSV ham kaydı korur.
   */
  const TUR = [[/^SELL/, 'Satış — uzun kapandı'], [/^COVER/, 'Alış — kısa kapandı'], [/^BUY/, 'Alış'], [/^SHORT/, 'Açığa satış'], [/^OPEN/, 'Açık (dönem sonu)']];
  const EK = { 'Kademe Stop': 'kademe stop', 'Kısmi TP': 'kısmi kâr al' };
  function turAd(tip) {
    const t = String(tip || '');
    const bulunan = TUR.find(([re]) => re.test(t));
    if (!bulunan) return t || '—';
    const ek = (t.match(/\(([^)]+)\)/) || [])[1];
    return ek ? `${bulunan[1]} (${EK[ek] || ek})` : bulunan[1];
  }
  function sebepAd(sebep) {
    let r = String(sebep || '');
    if (!r) return '';
    r = r.replace(/^LONG KAPAT\s*—\s*/, 'Uzun pozisyon kapandı: ')
      .replace(/^LONG AÇ\s*—\s*/, 'Uzun pozisyon açıldı: ')
      .replace(/^SHORT KAPAT\s*—\s*/, 'Kısa pozisyon kapandı: ')
      .replace(/^SHORT AÇ\s*—\s*/, 'Kısa pozisyon açıldı: ')
      .replace(/^TAKE_PROFIT/, 'Kâr al')
      .replace(/^Stop-Loss Triggered/, 'Zarar durdur tetiklendi')
      .replace(/^Breakeven Stop-Out/, 'Başabaş stopu')
      .replace(/^LİKİDASYON/, 'Tasfiye (likidasyon)')
      // "kapanış 61234.5 < SMA100 60000" → "kapanış SMA100 altında (61.234,5 / 60.000)"
      .replace(/kapanış\s+([\d.]+)\s*([<>])\s*(SMA\d+)\s+([\d.]+)/g, (m, a, op, ad, b) => `kapanış ${ad} ${op === '<' ? 'altında' : 'üstünde'} (${sayi(+a, 2)} / ${sayi(+b, 2)})`)
      .replace(/(SMA\d+)\s+[\d.]+\s*>\s*(SMA\d+)\s+[\d.]+/g, (m, a, b) => `${a} ${b} üstünde`);
    return r;
  }
  const gun = (ms) => new Date(ms).toISOString().slice(0, 10);
  // Eksi işareti dolar simgesinin önünde: -$3,82 ($-3,82 değil).
  const para = (x) => (x == null || Number.isNaN(+x) ? '—' : `${x < 0 ? '-' : ''}${sayi(Math.abs(+x), 2)}`);
  const bildir = (m, t) => (AG.bildir ? AG.bildir(m, t || 'bilgi') : global.alert(m));

  let sonKapsam = null;
  let kapsamZamanlayici = null;

  // ── Form ────────────────────────────────────────────────────────────────
  function deger(id, yedek) { const e = bul(id); return e && e.value !== '' ? e.value : yedek; }

  /** Formdan veri kaynağı + koşu ayarları. */
  function kaynakGovdesi() {
    const market = deger('btMarket', 'spot');
    return {
      symbol: deger('btSymbol', 'BTC/USDT'),
      timeframe: deger('btTimeframe', '1h'),
      market,
      venue: deger('btExchangeProvider', 'binance'),
      leverage: market === 'perp' ? Math.max(1, Math.min(100, Number(deger('btLeverage', 1)) || 1)) : 1,
      bas: deger('btStart', ''),
      bit: deger('btEnd', ''),
      initialCapital: parseFloat(deger('btCapital', '10000')) || 10000
    };
  }

  function hizliAralik(kod) {
    const bitis = new Date();
    const bas = new Date(bitis);
    if (kod === 'tum') { bul('btStart').value = sonKapsam && sonKapsam.ilk ? gun(sonKapsam.ilk) : '2017-01-01'; }
    else {
      const [n, birim] = [parseInt(kod, 10), kod.slice(-1)];
      if (birim === 'y') bas.setUTCFullYear(bas.getUTCFullYear() - n);
      else if (birim === 'a') bas.setUTCMonth(bas.getUTCMonth() - n);
      else if (birim === 'g') bas.setUTCDate(bas.getUTCDate() - n);
      bul('btStart').value = gun(bas.getTime());
    }
    bul('btEnd').value = gun(bitis.getTime());
    kapsamYenile();
  }

  function piyasaDegisti() {
    const perp = deger('btMarket', 'spot') === 'perp';
    const k = bul('btLeverageGroup');
    if (k) k.classList.toggle('is-hidden', !perp);
    kapsamYenile();
  }

  // ── Veri kapsamı ────────────────────────────────────────────────────────
  function kapsamYenile() {
    clearTimeout(kapsamZamanlayici);
    kapsamZamanlayici = setTimeout(kapsamGetir, 350);
  }

  async function kapsamGetir() {
    const kutu = bul('btKapsam');
    if (!kutu) return;
    const g = kaynakGovdesi();
    const q = new URLSearchParams({ symbol: g.symbol, timeframe: g.timeframe, market: g.market, venue: g.venue, bas: g.bas, bit: g.bit });
    doldur(kutu, [el('span', { class: 'hint', text: 'Veri kapsamı hesaplanıyor…' })]);
    let r;
    try { r = await istek(`/api/veri/kapsam?${q}`); } catch (e) { doldur(kutu, [AG.bildirim.hataKutusu(e.message, { baslik: 'Veri kapsamı okunamadı', yeniden: () => kapsamGetir() })]); return; }
    if (!r.success) { doldur(kutu, [el('span', { class: 'text-neg', text: r.error })]); return; }
    sonKapsam = r;
    const k = r.kapsam;
    const eksik = k.eksikMum || 0;
    // Ölçülen indirme hızı ~11 bin mum/sn (5 eş zamanlı istek).
    const sureSn = Math.ceil(eksik / 11000);
    const simSn = Math.ceil(k.beklenen / 3000);   // motor ~0,3 ms/bar (stratejiye göre değişir)
    const uyar = k.beklenen > 1500000;
    doldur(kutu, [
      el('div', { class: 'rule-title' }, [el('span', { text: 'Veri kapsamı' })]),
      el('dl', { class: 'kv-list' }, [
        ['Borsadaki ilk mum', r.ilk ? gun(r.ilk) : 'bilinmiyor (ağ?)'],
        ['Seçilen aralık', k.beklenen ? `${gun(k.bas)} → ${gun(k.bit)}` : '—'],
        ['Mum sayısı', sayi(k.beklenen)],
        ['Depoda', `${sayi(k.depoda)}${eksik ? ` · eksik ${sayi(eksik)}` : ' · tamam'}`],
        ['Tahmini süre', `${eksik ? `indirme ~${sureSn} sn · ` : ''}simülasyon ~${simSn} sn`]
      ].flatMap(([a, b]) => [el('dt', { text: a }), el('dd', { text: b })])),
      uyar ? el('p', { class: 'text-warn mt-3', text: `⚠ ${sayi(k.beklenen)} mum çok uzun: simülasyon dakikalar sürebilir. Strateji 1 dakikalık için tasarlanmadıysa daha büyük bir zaman dilimi seçin.` }) : null,
      eksik ? el('button', { type: 'button', class: 'btn btn-secondary btn-sm mt-3', onclick: (e) => indir(e.currentTarget) }, [el('span', { text: `Eksik ${sayi(eksik)} mumu şimdi indir` })]) : null
    ]);
  }

  async function indir(dugme) {
    const g = kaynakGovdesi();
    AG.dom.mesgul && AG.dom.mesgul(dugme, 'İndiriliyor…');
    try {
      const r = await istek('/api/veri/indir', g);
      if (!r.success) throw new Error(r.error);
      await isiIzle(r.is.id, 'Veri indiriliyor');
      bildir('Veri indirildi.', 'ok');
    } catch (e) { bildir('İndirme: ' + e.message, 'hata'); }
    finally { AG.dom.hazir && AG.dom.hazir(dugme); kapsamGetir(); }
  }

  // ── İş izleme: tek tip gösterge (js/core/ilerleme.js) ───────────────────
  /** İş bitene kadar 700 ms'de bir yoklar; bitince sonucu döndürür (gösterge 1,5 sn "bitti" kalır). */
  function isiIzle(id, baslik) {
    return AG.ilerleme.izle({
      id, baslik, kutu: bul('btIsDurum'), aralik: 700, bitinceGoster: 1500,
      oku: (x) => istek(`/api/is/${x}`),
      iptal: (is) => istek(`/api/is/${is.id}/iptal`, {})
    });
  }

  /**
   * Backtest işi başlatır ve sonucu döndürür.
   * @param tur 'tek' | 'optimize' | 'walkforward'
   * @param ek  strategyName, customConfig, optimizeParams, katSayisi …
   */
  async function calistir(tur, ek = {}) {
    const g = { ...kaynakGovdesi(), ...ek, tur };
    const r = await istek('/api/backtest/is', g);
    if (!r.success) throw new Error(r.error);
    const ad = { tek: 'Backtest', optimize: 'Optimizasyon', walkforward: 'Walk-forward' }[tur];
    return isiIzle(r.is.id, ad);
  }

  // ── Rapor ekleri ────────────────────────────────────────────────────────
  let islemSayfa = 0;
  const SAYFA = 50;

  function varsayimCiz(s) {
    const kutu = bul('btVarsayimlar');
    if (!kutu) return;
    const v = s.varsayimlar;
    if (!v) { doldur(kutu, []); return; }
    const c = s.analytics && s.analytics.capital;
    const calmar = c && c.cagr != null && s.maxDrawdownPct > 0 ? (c.cagr / s.maxDrawdownPct) : null;
    doldur(kutu, [
      el('div', { class: 'row row-wrap gap-5 mono-note' }, [
        `${v.borsa} · ${v.piyasa === 'perp' ? 'vadeli' : 'spot'}${v.kaldirac > 1 ? ` · ${v.kaldirac}x` : ''}`,
        `${(v.bas || '').slice(0, 10)} → ${(v.bit || '').slice(0, 10)} · ${sayi(v.mumSayisi)} mum`,
        `komisyon %${v.komisyonPct} tek yön`,
        v.funding ? `funding: ${v.funding === 'gercek' ? 'gerçek geçmiş' : 'sabit varsayım'}` : null,
        `ısınma ${v.isinmaBar} bar`,
        s.seyreltme && s.seyreltme.yontem !== 'yok' ? `grafik ${sayi(s.seyreltme.gonderilen)} / ${sayi(s.seyreltme.tamBar)} noktaya seyreltildi (metrikler tam veriden)` : null
      ].filter(Boolean).map(t => el('span', { text: t }))),
      el('div', { class: 'stats-grid grid-auto-160 mt-5' }, [
        ['İşlem', sayi(s.totalTrades)],
        ['Yıllık bileşik (CAGR)', c && c.cagr != null ? yuzde(c.cagr) : '—'],
        ['Calmar (CAGR / düşüş)', calmar == null ? '—' : sayi(calmar, 2)],
        ['En uzun kazanç / kayıp serisi', `${s.maxWinStreak ?? '—'} / ${s.maxLossStreak ?? '—'}`],
        ['Ödenen komisyon', s.analytics && s.analytics.returns && s.analytics.returns.earnings ? `$${sayi(s.analytics.returns.earnings.commission, 2)}` : '—'],
        ['Kapsanan gün', c ? sayi(c.coveredDays) : '—']
      ].map(([a, b]) => el('div', { class: 'glass-panel stat-card' }, [el('span', { class: 'stat-title', text: a }), el('div', { class: 'stat-value stat-value-md', text: b })])))
    ]);
  }

  function aylikCiz(s) {
    const kutu = bul('btAylik');
    if (!kutu) return;
    const satirlar = s.aylikGetiriler || [];
    if (!satirlar.length) { doldur(kutu, [el('p', { class: 'hint', text: 'Aylık tablo için veri yok.' })]); return; }
    const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const hucre = (v) => el('td', { class: v == null ? 'tone-muted' : (v >= 0 ? 'tone-success' : 'tone-danger'), text: v == null ? '' : yuzde(v, 1) });
    doldur(kutu, [AG.tablo.kutulu({
      sinif: 'aylik-tablo',
      basliklar: ['Yıl', ...AY, 'Yıl'],
      satirlar: satirlar.map(y => el('tr', null, [el('td', { class: 'fw-semibold', text: String(y.yil) }), ...y.aylar.map(hucre), hucre(y.toplam)]))
    })]);
  }

  function islemCiz(s) {
    const kutu = bul('btIslemListesi');
    if (!kutu) return;
    const kapali = (s.trades || []).filter(t => t.exitTime);
    const toplamSayfa = Math.max(1, Math.ceil(kapali.length / SAYFA));
    if (islemSayfa >= toplamSayfa) islemSayfa = toplamSayfa - 1;
    const parca = kapali.slice(islemSayfa * SAYFA, (islemSayfa + 1) * SAYFA);
    let birikim = kapali.slice(0, islemSayfa * SAYFA).reduce((t, x) => t + (x.profitUSDT || 0), 0);
    const tarih = (t) => (t ? String(t).replace('T', ' ').slice(0, 16) : '—');
    const satirlar = parca.map((t, i) => {
      birikim += t.profitUSDT || 0;
      const tr = AG.dom.satir([
        String(islemSayfa * SAYFA + i + 1),
        turAd(t.type), tarih(t.entryTime), tarih(t.exitTime),
        sayi(t.entryPrice, 4), sayi(t.exitPrice, 4), sayi(t.amount, 6),
        para(t.profitUSDT), yuzde(t.profitPct), para(birikim),
        t.barsInTrade != null ? String(t.barsInTrade) : '—', sebepAd(t.reason)
      ]);
      if (tr.children[7]) tr.children[7].className = (t.profitUSDT || 0) >= 0 ? 'tone-success' : 'tone-danger';
      return tr;
    });
    const sayfaDugme = (metin, hedef, kapali2) => el('button', { type: 'button', class: 'btn btn-secondary btn-sm', disabled: kapali2 ? 'disabled' : null, onclick: () => { islemSayfa = hedef; islemCiz(s); } }, [el('span', { text: metin })]);
    doldur(kutu, [
      el('div', { class: 'row-between row-wrap gap-3 mb-3' }, [
        el('span', { class: 'hint', text: `${sayi(kapali.length)} kapanan işlem${s.islemlerKirpildi ? ` (panelde ilk ve son ${sayi(s.islemlerKirpildi.gonderilen)}; tamamı ${sayi(s.islemlerKirpildi.toplam)} — CSV'de)` : ''}` }),
        el('div', { class: 'row gap-2' }, [
          sayfaDugme('‹', islemSayfa - 1, islemSayfa === 0),
          el('span', { class: 'hint', text: `${islemSayfa + 1} / ${toplamSayfa}` }),
          sayfaDugme('›', islemSayfa + 1, islemSayfa >= toplamSayfa - 1),
          s.isId ? el('a', { class: 'btn btn-secondary btn-sm', href: `/api/is/${s.isId}/islemler.csv`, download: '' }, [el('span', { text: 'CSV indir' })]) : null
        ])
      ]),
      AG.tablo.kutulu({
        basliklar: ['#', 'Tür', 'Giriş', 'Çıkış', 'Giriş fiyatı', 'Çıkış fiyatı', 'Miktar', 'Kâr/zarar', '%', 'Birikimli', 'Bar', 'Sebep'],
        satirlar: satirlar.length ? satirlar : [el('tr', null, [el('td', { colspan: '12', class: 'tone-muted', text: 'Kapanan işlem yok' })])]
      })
    ]);
  }

  function raporCiz(s) {
    islemSayfa = 0;
    varsayimCiz(s);
    aylikCiz(s);
    islemCiz(s);
    const k = bul('btRaporEk');
    if (k) k.classList.remove('is-hidden');
  }

  // ── Başlatma ────────────────────────────────────────────────────────────
  function baslat() {
    if (!bul('btStart')) return;
    if (!bul('btStart').value) hizliAralik('1y');
    for (const id of ['btSymbol', 'btTimeframe', 'btExchangeProvider', 'btStart', 'btEnd']) {
      const e = bul(id); if (e) e.addEventListener('change', kapsamYenile);
    }
    const m = bul('btMarket'); if (m) m.addEventListener('change', piyasaDegisti);
    global.document.querySelectorAll('[data-bt-aralik]').forEach(d => d.addEventListener('click', () => hizliAralik(d.getAttribute('data-bt-aralik'))));
    // Backtest ekranı açılınca (menü / URL — js/core/rota.js) veri kapsamı tazelenir.
    global.document.addEventListener('ag:rota', (e) => {
      if (e.detail && e.detail.bolum === 'tab-backtest') setTimeout(kapsamGetir, 100);
    });
    piyasaDegisti();
  }

  AG.pages = AG.pages || {};
  AG.pages.backtestIs = { turAd, sebepAd, yuzde, calistir, kaynakGovdesi, raporCiz, kapsamGetir, hizliAralik, TF_MS };
  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', baslat);
  else baslat();
})(typeof window !== 'undefined' ? window : globalThis);
