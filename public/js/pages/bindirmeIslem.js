/**
 * PORTFÖY BOTU İŞLEMLERİ — ANA CANLI GRAFİĞİN ALTINDA (Botlar ekranı).
 * ═══════════════════════════════════════════════════════════════════════════
 * Grafiğin kendisinde (köprü: `AG.canliGrafik`, public/app.js):
 *   · seçili botun gösterilen semboldeki işlemleri: LONG AÇ yeşil ▲, kapanış/TP kırmızı ▼,
 *     DCA dolumu küçük ● — imleç mumun üzerine gelince ayrıntı (zaman/fiyat/miktar/sebep)
 *     grafiğin hemen altındaki şeritte (#botIsaretBilgi)
 *   · bekleyen emirler (DCA merdiveni, TP) yatay KESİKLİ çizgi; açık pozisyonun ortalama girişi düz çizgi
 *   · grafik başlığının altında botun işlem gördüğü semboller için hızlı geçiş düğmeleri (pozisyonu olan vurgulu)
 * Grafiğin altında sekmeli panel: Açık pozisyonlar · Bekleyen emirler · İşlem geçmişi · Performans.
 * Tablo satırına tıklayınca grafik o sembole geçer ve (varsa) işlemin mumuna odaklanır.
 * İşlem geçmişi: "yalnız bot" (islemler.jsonl) ya da "tüm hesap" (hesap-islemleri.jsonl — elle,
 * acil, diğer botlar, funding dahil); tarih aralığı, sembol/kaynak süzgeci, toplamlar, CSV.
 * Uçlar: /api/bindirme/:ad/islemler (15 sn önbellek) · /grafik?mumsuz=1 · /api/hesap-islemleri(.csv).
 * 64.6 (kullanıcı: "iki tane işlem geçmişi — asma kabağı"): pozisyon / emir / geçmiş TEK YERDE, burada. Açık pozisyonlar ve
 * bekleyen emirler Binance'in canlı verisiyle (GET /api/bindirme/:ad/binance-bakiye — Botlar kartındaki bakiye dökümüyle aynı salt-okur
 * kaynak, sunucu bağlantısı uyumlu): Binance "Positions" sütunları (Size, Entry, Break-even, Mark, Liq, Margin = positionInitialMargin,
 * PNL, ROI, kaldıraç Binance'in leverage alanı) ve "Open Orders" Basic + Conditional. İşlem geçmişi Binance "Trade History" alanlarıyla
 * (zaman, sembol, yön, fiyat, miktar, ücret, rol, gerçekleşen kâr). Binance verisi yoksa (kâğıt / bağlı değil) eski tablolar.
 * Tüm DOM `AG.dom.el`; renkler `AG.tema.palet()`; inline stil yok.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const { el, doldur, bul } = AG.dom;

  const ADLAR = [['hucum', 'Kairos'], ['denge', 'Tao']];
  // 62.6: performans grafiği botun kartında; burada sepet dağılımının geçmişi. Sade terimler: kol → bölüm (BTC / trend takibi / kademeli alım).
  const SEKMELER = [['pozisyon', 'Açık pozisyonlar'], ['emir', 'Bekleyen emirler'], ['gecmis', 'İşlem geçmişi'], ['performans', 'Pozisyon büyüklüğü']];   // 67.5: eski adı 'Dağılım geçmişi' (büyüme kâr sanılıyordu)
  const KOL_AD = { 'BTC ayağı': 'BTC', Donchian: 'trend takibi', donchian: 'trend takibi', DCA: 'kademeli alım', dca: 'kademeli alım' };
  const kolAd = (k) => KOL_AD[k] || k;
  const durum = { ad: 'hucum', sekme: 'pozisyon', mod: 'bot', sayfa: 1, sembol: '', kol: '', kaynak: '', bas: '', bit: '', zaman: 0, perfZaman: 0, son: null, binance: null };
  let isaretler = [];          // gösterilen sembolün bot işlemleri
  let cizgiler = [];           // grafikteki fiyat çizgilerimiz
  let abone = null;            // crosshair aboneliği yapılmış grafik
  let ozGrafik = null, kolGrafik = null;

  const sayi = (x, b = 2) => (x == null || Number.isNaN(+x) ? '—' : (+x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b }));
  // Denetim A-35: miktar ve küçük fiyatlar da Türkçe biçimde ("0,0116"; "0.0116" değil) — Hesaplar ile aynı.
  const miktar = (x) => (x == null || Number.isNaN(+x) ? '—' : (+(+x).toPrecision(8)).toLocaleString('tr-TR', { maximumFractionDigits: 8 }));
  const fiyat = (x) => (x == null || Number.isNaN(+x) ? '—' : (+x >= 100 ? sayi(x, 2) : (+x).toLocaleString('tr-TR', { maximumSignificantDigits: 6 })));
  const ts = (t) => AG.fmt.tarihSaat(t);
  const yonMetni = (side) => (side === 'buy' ? 'Alış' : side === 'sell' ? 'Satış' : '—');
  /** Denetim A-31: iç hesap adı "testnet" ekranda "demo hesap" (tek kullanıcı terimi). */
  const hesapAdi = (h) => (!h ? '—' : /testnet/i.test(h) ? String(h).replace(/testnet/ig, 'demo hesap') : h);
  /** 'BTC/USDT:USDT' | 'BTC/USDT (spot)' → 'BTC/USDT' (canlı grafiğin sembol biçimi). */
  const grafikSembolu = (s) => String(s || '').replace(' (spot)', '').split(':')[0];
  const ayniSembol = (a, b) => grafikSembolu(a) === grafikSembolu(b);
  const G = () => AG.canliGrafik;
  const adGorunen = () => (AG.botAd && AG.botAd.ad(durum.ad)) || (ADLAR.find(a => a[0] === durum.ad) || [])[1] || durum.ad;

  /** Sıralanabilir tablo (js/core/tablo.js); `anahtar` sıralama seçimini tazelemeler arasında korur. Sayfalı geçmişte gösterilen sayfa sıralanır. */
  function tablo(basliklar, satirlar, bos, anahtar) {
    if (!satirlar.length) return el('p', { class: 'hint hint-sm mb-0', text: bos });
    return AG.tablo.kutulu({ sinif: 'bot-tablo', basliklar, satirlar, siralanabilir: anahtar || true });
  }
  const hucreTon = (tr, i, sinif) => { if (tr.children[i] && sinif) tr.children[i].className = sinif; return tr; };
  /** Satıra tıklayınca grafik o sembole geçer, zaman verilmişse o mumun çevresine odaklanır. */
  function tiklanir(tr, sembol, zaman) {
    tr.classList.add('clickable');
    tr.title = `Grafikte göster: ${grafikSembolu(sembol)}${zaman ? ` · ${ts(zaman)}` : ''}`;
    tr.addEventListener('click', () => { if (G()) Promise.resolve(G().git(grafikSembolu(sembol), zaman || null)).catch(() => null); });
    return tr;
  }
  function secici(id, etiket, secenekler, secili, degisti) {
    return el('select', { id, class: 'form-control control-sm sunken-deep w-auto', 'aria-label': etiket, onchange: (e) => degisti(e.target.value) },
      secenekler.map(([v, t]) => { const o = el('option', { value: v, text: t }); if (v === secili) o.selected = true; return o; }));
  }

  // ── Grafik üstü: işaretler, çizgiler, imleç bilgisi, hızlı geçiş ─────────────
  /** app.js renderChartTradeMarkers çağırır: gösterilen sembol için bot işaretleri. */
  function grafikIsaretleri(sembol, dilim, bucketStart) {
    if (!sembol || !dilim) return [];
    const p = AG.tema.palet();
    return isaretler.filter(i => ayniSembol(i.symbol || sembol, sembol)).map(i => {
      const t = bucketStart(Math.floor(i.zaman / 1000), dilim);
      if (i.tur === 'dca') return { time: t, position: 'belowBar', color: p.info, shape: 'circle', size: 0.5, text: '' };
      if (i.tur === 'giris') return { time: t, position: 'belowBar', color: p.pos, shape: 'arrowUp', text: i.kol === 'BTC ayağı' ? 'LONG AÇ' : `${i.kol || ''} AL` };
      return { time: t, position: 'aboveBar', color: p.neg, shape: 'arrowDown', text: /TP/.test(i.neden || '') ? 'TP' : 'KAPAT' };
    });
  }

  function cizgileriTemizle() {
    const seri = G() && G().seri();
    for (const c of cizgiler) { try { seri.removePriceLine(c); } catch (e) { /* gitti */ } }
    cizgiler = [];
  }

  /** Bekleyen emirler kesikli, ortalama giriş düz çizgi — yalnız gösterilen sembol. */
  function cizgileriCiz() {
    cizgileriTemizle();
    const seri = G() && G().seri();
    const r = durum.son;
    if (!seri || !r || !r.canli || typeof seri.createPriceLine !== 'function') return;
    const sembol = G().sembol();
    const p = AG.tema.palet();
    const ekle = (o) => { try { cizgiler.push(seri.createPriceLine({ lineWidth: 1, axisLabelVisible: true, ...o })); } catch (e) { /* yok */ } };
    for (const poz of r.canli.pozisyonlar.filter(x => ayniSembol(x.symbol, sembol))) {
      if (poz.giris > 0) ekle({ price: +poz.giris, color: p.accent, lineStyle: 0, lineWidth: 2, title: `Ort. giriş ${poz.yon} ${miktar(poz.miktar)}` });
    }
    for (const o of r.canli.emirler.filter(x => ayniSembol(x.symbol, sembol) && x.fiyat > 0)) {
      ekle({ price: +o.fiyat, color: o.side === 'buy' ? p.pos : p.neg, lineStyle: 2, title: (o.neden || `${o.kol} ${yonMetni(o.side)}`).replace(/ \(.*\)$/, '') });
    }
  }

  /** İmleç bir mumun üzerindeyken o mumdaki bot işlemlerini grafiğin altındaki şeride yazar. */
  function imlecAboneligi() {
    const g = G() && G().grafik();
    if (!g || abone === g || typeof g.subscribeCrosshairMove !== 'function') return;
    abone = g;
    g.subscribeCrosshairMove((param) => {
      const yer = bul('botIsaretBilgi');
      if (!yer) return;
      const dilim = G().dilim();
      const t = param && typeof param.time === 'number' ? param.time : null;
      if (t == null || !dilim) { yer.textContent = ''; return; }
      const burada = isaretler.filter(i => G().bucketStart(Math.floor(i.zaman / 1000), dilim) === t);
      yer.textContent = burada.map(i => `${ts(i.zaman)} · ${i.kol} ${yonMetni(i.side)} ${miktar(i.miktar)} @ ${fiyat(i.fiyat)} — ${i.neden || 'sebep kaydı yok'}`).join('   |   ');
    });
  }

  function hizliGecis(r) {
    const yer = bul('botSembolDugmeleri');
    if (!yer) return;
    const pozlu = new Set(((r.canli && r.canli.pozisyonlar) || []).map(p => grafikSembolu(p.symbol)));
    if (r.canli && r.canli.spot) pozlu.add(`${r.canli.spot.varlik}/USDT`);
    const hepsi = [...new Set([...pozlu, ...(r.islemSembolleri || [])])].sort((a, b) => (pozlu.has(b) - pozlu.has(a)) || a.localeCompare(b));
    const aktif = G() && G().sembol();
    doldur(yer, hepsi.length ? [el('span', { class: 'hint hint-sm mb-0', text: `${adGorunen()} botunun işlem yaptığı semboller (coin ve hisse vadelileri; ● = açık pozisyon):` }), ...hepsi.map(s =>
      el('button', { type: 'button', class: `btn btn-xs ${pozlu.has(s) ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': s === aktif ? 'true' : 'false',
        title: `${s}${pozlu.has(s) ? ' — açık pozisyon var' : ''}`, onclick: () => G() && G().git(s) }, [el('span', { text: `${s.split('/')[0]}${pozlu.has(s) ? ' ●' : ''}` })]))] : []);
  }

  // ── Binance canlı verisi (64.6) ──────────────────────────────────────────
  const fyt = (x) => {                 // Binance gibi: büyük fiyatta 2, küçükte daha çok ondalık
    if (x == null || !Number.isFinite(+x) || +x === 0) return '—';
    const a = Math.abs(+x), b = a >= 1000 ? 2 : a >= 1 ? 4 : 7;
    return (+x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: b });
  };
  const yuzde2 = (x) => (x == null || !Number.isFinite(+x) ? '—' : `${x > 0 ? '+' : x < 0 ? '-' : ''}%${Math.abs(x * 100).toFixed(2).replace('.', ',')}`);
  /** Binance verisi kullanılabilir mi (bağlı + Binance hesabı + yanıt başarılı). */
  const binanceVar = () => { const b = durum.binance && durum.binance.r; return b && b.success !== false && b.bagli && b.binance !== false && Array.isArray(b.pozisyonlar) ? b : null; };
  async function binanceYukle() {
    if (!AG.api.bindirmeBinanceBakiye) return;
    // Botlar kartı aynı veriyi 12 sn'de bir okuyor: tazeyse onu kullan (sunucuda da 10 sn önbellek)
    const ortak = AG.pages.botlar && AG.pages.botlar._binanceVeri && AG.pages.botlar._binanceVeri[durum.ad];
    if (ortak && ortak.r && Date.now() - ortak.zaman < 13000) { durum.binance = ortak; return; }
    try { durum.binance = { zaman: Date.now(), r: await AG.api.bindirmeBinanceBakiye(durum.ad) }; } catch (e) { durum.binance = { zaman: Date.now(), hata: e.message }; }
  }
  /** Bölüm (kol) metni: pozisyonun bota ait kısmı (botun kendi kaydı). */
  function kolMetniBul(r, sembol) {
    const p = r && r.canli && r.canli.pozisyonlar.find(x => ayniSembol(x.symbol, sembol));
    return p ? (Object.entries(p.kollar || {}).map(([ad, q]) => `${kolAd(ad)} ${miktar(q)}`).join(' · ') || '— (bota ait değil)') : '—';
  }
  function binancePozisyonlari(b, r) {
    const satirlar = b.pozisyonlar.map(p => {
      const tr = AG.dom.satir([`${grafikSembolu(p.sembol || p.symbol)}${p.kaldirac ? ` · ${p.kaldirac}x` : ''}${p.marjTipi === 'izole' ? ' · izole' : ''}`, `${p.yon === 'SHORT' ? '−' : ''}${miktar(Math.abs(p.miktar))}`,
        fyt(p.giris), fyt(p.basabas), fyt(p.mark), fyt(p.likidasyon), sayi(p.teminat), sayi(p.kz), yuzde2(p.roi), kolMetniBul(r, p.sembol || p.symbol)]);
      hucreTon(tr, 7, AG.fmt.tonSinifi(p.kz)); hucreTon(tr, 8, AG.fmt.tonSinifi(p.roi));
      return tiklanir(tr, p.sembol || p.symbol);
    });
    const alt = [AG.dom.satir(['Toplam', '', '', '', '', '', sayi(b.pozTeminatToplam), sayi((b.bakiye || {}).gerceklesmemis), '', ''])];
    const bt = (b.bakiye || {}).pozisyonTeminati;
    return el('div', null, [
      el('div', { class: 'hint hint-sm mb-2', id: 'botPozBinanceNot', text: `Binance "Positions" ile aynı sütunlar · işaret fiyatı (Mark) · teminat = pozisyonun kendi teminatı (açık emrin teminatı dahil değil) · okundu ${ts(b.zaman)}${b.evKaynak ? ' (sunucudaki panelden)' : ''} · satıra tıkla → grafik` }),
      satirlar.length ? AG.tablo.kutulu({ id: 'tblBotPozBinance', sinif: 'bot-tablo', siralanabilir: 'bot-pozisyon-binance', satirlar, altSatirlar: alt,
        basliklar: ['Sembol', 'Miktar (Size)', 'Giriş (Entry)', 'Başabaş (Break-even)', 'İşaret (Mark)', 'Likidasyon (Liq.)', 'Teminat (Margin)', 'K/Z (PNL)', 'ROI', 'Bölüm'] })
        : el('p', { class: 'hint hint-sm mb-0', text: 'Açık pozisyon yok.' }),
      bt != null && Math.abs(bt - b.pozTeminatToplam) > 0.01 ? el('p', { class: 'hint hint-sm mb-0 mt-1 tone-warning', text: `Teminat toplamı ${sayi(b.pozTeminatToplam)} ≠ Binance hesap toplamı ${sayi(bt)} USDT.` }) : null,
    ]);
  }
  function binanceEmirleri(b, r) {
    const em = b.emirler || {}, temel = em.temel || [], kos = em.kosullu;
    const neden = (kimlik) => { const o = r && r.canli && r.canli.emirler.find(x => x.id && x.id === kimlik); return o ? (o.neden || kolAd(o.kol)) : null; };
    const temelSatir = (o) => tiklanir(hucreTon(AG.dom.satir([ts(o.zaman), grafikSembolu(o.sembol || o.symbol), o.tip || '—', yonMetni(o.side), fyt(o.fiyat), miktar(o.miktar), miktar(o.dolan),
      o.reduceOnly ? 'evet' : 'hayır', o.tif || '—', o.bizim ? (neden(o.kimlik) || 'bot') : 'yabancı']), 3, o.side === 'buy' ? 'tone-success' : 'tone-danger'), o.sembol || o.symbol);
    const kosSatir = (o) => tiklanir(hucreTon(AG.dom.satir([ts(o.zaman), grafikSembolu(o.sembol || o.symbol), o.tip || '—', yonMetni(o.side), o.fiyat ? fyt(o.fiyat) : 'piyasa',
      `${o.calismaTipi === 'MARK_PRICE' ? 'İşaret' : o.calismaTipi === 'CONTRACT_PRICE' ? 'Son' : ''} fiyat ${o.side === 'sell' ? '≤' : '≥'} ${fyt(o.tetik)}`.trim(),
      o.tumPozisyon ? 'tüm pozisyon' : miktar(o.miktar), o.reduceOnly ? 'evet' : 'hayır', o.bizim ? (/^ag-fs-/.test(o.kimlik || '') ? 'koruma stopu (bot)' : 'bot') : 'yabancı']), 3, o.side === 'buy' ? 'tone-success' : 'tone-danger'), o.sembol || o.symbol);
    const yerel = ((r && r.canli && r.canli.emirler) || []).filter(o => /yerelde/.test(o.durum || ''));
    return el('div', null, [
      el('div', { class: 'hint hint-sm mb-2', text: `Binance "Open Orders" ile aynı: Basic ${temel.length} · Conditional ${kos ? kos.length : '?'} · okundu ${ts(b.zaman)} · gösterilen sembolün emirleri grafikte kesikli çizgi` }),
      el('h5', { class: 'pf-bolum-baslik', text: `Temel emirler (Basic) — ${temel.length}` }),
      temel.length ? AG.tablo.kutulu({ id: 'tblBotEmirTemel', sinif: 'bot-tablo', siralanabilir: 'bot-emir-temel', satirlar: temel.map(temelSatir),
        basliklar: ['Zaman', 'Sembol', 'Tip', 'Yön', 'Fiyat', 'Miktar', 'Dolan', 'Yalnız azaltan', 'Süre (TIF)', 'Sebep'] }) : el('p', { class: 'hint hint-sm mb-2', text: 'Temel emir yok.' }),
      el('h5', { class: 'pf-bolum-baslik mt-2', text: `Koşullu emirler (Conditional) — ${kos ? kos.length : '?'}` }),
      kos == null ? el('p', { class: 'hint hint-sm mb-0 tone-warning', text: `Koşullu emirler okunamadı${b.algoHata ? ` (${b.algoHata})` : ''}.` })
        : kos.length ? AG.tablo.kutulu({ id: 'tblBotEmirKosullu', sinif: 'bot-tablo', siralanabilir: 'bot-emir-kosullu', satirlar: kos.map(kosSatir),
          basliklar: ['Zaman', 'Sembol', 'Tip', 'Yön', 'Fiyat', 'Tetik koşulu', 'Miktar', 'Yalnız azaltan', 'Sebep'] }) : el('p', { class: 'hint hint-sm mb-0', text: 'Koşullu emir yok.' }),
      yerel.length ? el('h5', { class: 'pf-bolum-baslik mt-2', text: `Pusula'da bekleyen (henüz Binance'e gönderilmedi) — ${yerel.length}` }) : null,
      yerel.length ? AG.tablo.kutulu({ id: 'tblBotEmirYerel', sinif: 'bot-tablo', satirlar: yerel.map(o => tiklanir(AG.dom.satir([o.symbol.split(':')[0], yonMetni(o.side), o.tip, miktar(o.miktar), fyt(o.fiyat), o.neden || kolAd(o.kol)]), o.symbol)),
        basliklar: ['Sembol', 'Yön', 'Tip', 'Miktar', 'Fiyat', 'Sebep'] }) : null,
      el('p', { class: 'hint hint-sm mb-0 mt-1', text: 'Açık emir teminatını yalnız pozisyon büyüten emirler bağlar; "yalnız azaltan" satış ve koruma stopları teminat istemez.' }),
    ]);
  }
  /** Binance verisi yoksa neden (eski tabloların üstünde). */
  function binanceNotu() {
    const v = durum.binance;
    if (!v) return null;
    const b = v.r;
    const metin = v.hata ? `Binance canlı verisi okunamadı (${v.hata}) — botun kendi görünümü gösteriliyor.`
      : b && b.success === false ? `Binance canlı verisi okunamadı (${b.error || ''}) — botun kendi görünümü gösteriliyor.`
        : b && (!b.bagli || b.binance === false) ? `${b.neden || 'Binance verisi yok'} — botun kendi görünümü gösteriliyor.` : null;
    return metin ? el('p', { class: 'hint hint-sm mb-2 tone-warning', id: 'botBinanceYokNot', text: metin }) : null;
  }

  // ── Sekmeler ────────────────────────────────────────────────────────────
  function pozisyonSekmesi(r) {
    const b = binanceVar();
    if (b) return binancePozisyonlari(b, r);
    if (!r.bagli) return el('p', { class: 'hint hint-sm mb-0', text: `${adGorunen()} borsaya bağlı değil (çalışmıyor) — canlı pozisyon gösterilemez. Kayıtlar "İşlem geçmişi" sekmesinde.` });
    if (r.canliHata) return el('p', { class: 'hint hint-sm mb-0 tone-danger', text: `Borsa okunamadı: ${r.canliHata}` });
    const c = r.canli;
    const kolMetni = (k) => Object.entries(k || {}).map(([ad, q]) => `${kolAd(ad)} ${miktar(q)}`).join(' · ') || '— (bota ait değil)';
    const satirlar = c.pozisyonlar.map(p => tiklanir(hucreTon(AG.dom.satir([p.symbol.split(':')[0], p.yon, miktar(p.miktar), sayi(p.nominal), fiyat(p.giris), fiyat(p.mark), sayi(p.kz), kolMetni(p.kollar)]), 6, AG.fmt.tonSinifi(p.kz)), p.symbol));
    if (c.spot) satirlar.unshift(tiklanir(AG.dom.satir([`${c.spot.varlik} (spot)`, 'LONG', miktar(c.spot.miktar), sayi(c.spot.deger), '—', fiyat(c.spot.fiyat), '—', 'BTC (spot teminat)']), `${c.spot.varlik}/USDT`));
    return el('div', null, [
      binanceNotu(),
      el('div', { class: 'hint hint-sm mb-2', text: `${r.mod === 'demo' ? 'demo hesap' : 'kâğıt borsa'} · USDT toplam ${sayi(c.bakiye && c.bakiye.toplam)} · serbest ${sayi(c.bakiye && c.bakiye.serbest)} · okundu ${ts(c.zaman)} · satıra tıkla → grafik` }),
      tablo(['Sembol', 'Yön', 'Miktar', 'Nominal (USDT)', 'Giriş', 'Güncel', 'Kâr / zarar (açık)', 'Bölüm'], satirlar, 'Açık pozisyon yok.', 'bot-pozisyon'),
    ]);
  }

  function emirSekmesi(r) {
    const b = binanceVar();
    if (b) return binanceEmirleri(b, r);
    if (!r.bagli || !r.canli) return el('p', { class: 'hint hint-sm mb-0', text: r.canliHata ? `Borsa okunamadı: ${r.canliHata}` : 'Bot borsaya bağlı değil.' });
    const satirlar = r.canli.emirler.map(o => tiklanir(AG.dom.satir([o.symbol.split(':')[0], yonMetni(o.side), o.tip, miktar(o.miktar), fiyat(o.fiyat), o.durum, o.kol, o.neden || '—']), o.symbol));
    return el('div', null, [el('div', { class: 'hint hint-sm mb-2', text: 'Gösterilen sembolün emirleri grafikte kesikli yatay çizgi olarak da görünür.' }),
      tablo(['Sembol', 'Yön', 'Tip', 'Miktar', 'Fiyat', 'Durum', 'Bölüm', 'Sebep'], satirlar, 'Bekleyen emir yok.', 'bot-emir')]);
  }

  const csvYolu = () => `/api/hesap-islemleri.csv?hesap=${encodeURIComponent((durum.son && durum.son.hesap) || '')}&bas=${encodeURIComponent(durum.bas)}&bit=${encodeURIComponent(durum.bit)}&sembol=${encodeURIComponent(durum.sembol)}&kaynak=${encodeURIComponent(durum.kaynak)}`;

  /** İşlem geçmişi süzgeç çubuğu — sekme/kapsam değişince bir kez kurulur (tazeleme odak kaçırmasın). */
  function gecmisSuzgec(r) {
    const tarih = (id, etiket, alan) => el('input', { id, type: 'date', class: 'form-control control-sm sunken-deep w-auto', 'aria-label': etiket, title: etiket, value: durum[alan],
      onchange: (e) => { durum[alan] = e.target.value; durum.sayfa = 1; yukle(true); } });
    return el('div', { class: 'row row-wrap gap-2 mb-2' }, [
      secici('selBotGecmisMod', 'Kayıt kapsamı', [['bot', `Yalnız ${adGorunen()}`], ['hesap', `Tüm hesap (${hesapAdi(r.hesap)})`]], durum.mod, (v) => { durum.mod = v; durum.sayfa = 1; durum.kol = ''; durum.kaynak = ''; durum.sembol = ''; sekmeCiz(true); }),
      tarih('inpBotGecmisBas', 'Başlangıç tarihi', 'bas'), tarih('inpBotGecmisBit', 'Bitiş tarihi', 'bit'),
      el('span', { id: 'botGecmisSecimler', class: 'row row-wrap gap-2' }),
      el('a', { id: 'lnkHesapCsv', class: 'btn btn-xs btn-secondary', href: csvYolu(), download: '', title: 'Süzgeçlere uyan TÜM HESAP işlemleri (funding dahil) — CSV indir' }, [el('span', { text: '⬇ CSV' })]),
      el('button', { type: 'button', class: 'btn btn-xs btn-secondary', 'data-kilit': 'arastirma', title: 'Hesabın tüm dolumlarını borsadan şimdi çek (boşlukları doldurur)', onclick: async (e) => {
        const d = e.currentTarget;
        AG.dom.mesgul(d, '…');
        try {
          const s = await AG.api.hesapSenkron();
          if (!s.success) throw new Error(s.error);
          const t = (s.sonuc || []).reduce((a, x) => a + (x.yeniIslem || 0) + (x.yeniFunding || 0), 0);
          AG.bildir(`Hesap kaydı eşitlendi: ${t} yeni kayıt`, 'ok');
        } catch (err) { AG.bildir(`Eşitlenemedi: ${err.message}`, 'hata'); } finally { AG.dom.hazir(d); yukle(true); }
      } }, [el('span', { text: '↻ Borsadan eşitle' })]),
    ]);
  }

  function secimleriGuncelle(semboller, ikinci, ikinciAd) {
    const yer = bul('botGecmisSecimler');
    if (!yer) return;
    const alan = durum.mod === 'bot' ? 'kol' : 'kaynak';
    doldur(yer, [
      secici('selBotGecmisSembol', 'Sembol süzgeci', [['', 'Tüm semboller'], ...semboller.map(s => [s, s.split(':')[0]])], durum.sembol, (v) => { durum.sembol = v; durum.sayfa = 1; yukle(true); }),
      secici('selBotGecmisKaynak', `${ikinciAd} süzgeci`, [['', `Tüm ${ikinciAd.toLocaleLowerCase('tr-TR')}lar`], ...ikinci.map(k => [k, k])], durum[alan], (v) => { durum[alan] = v; durum.sayfa = 1; yukle(true); }),
    ]);
    const csv = bul('lnkHesapCsv');
    if (csv) csv.href = csvYolu();
  }

  function sayfaCubugu(g) {
    return el('div', { class: 'row row-wrap gap-2 mt-2' }, [
      el('span', { class: 'hint hint-sm mb-0', text: `${g.toplam} kayıt · sayfa ${g.sayfa}/${g.toplamSayfa}` }),
      el('button', { type: 'button', class: 'btn btn-xs btn-secondary', onclick: () => { durum.sayfa = Math.max(1, g.sayfa - 1); yukle(true); } }, [el('span', { text: '‹ Önceki' })]),
      el('button', { type: 'button', class: 'btn btn-xs btn-secondary', onclick: () => { durum.sayfa = Math.min(g.toplamSayfa, g.sayfa + 1); yukle(true); } }, [el('span', { text: 'Sonraki ›' })]),
    ]);
  }
  const toplamMetni = (t) => `Toplam: ${t.islem} işlem · ücret ${sayi(t.ucret, 4)} USDT · gerçekleşen K/Z ${sayi(t.kz)} USDT · funding ${t.funding == null ? '— (bot kaydında yok; "Tüm hesap"ta)' : `${sayi(t.funding, 4)} USDT (${t.fundingSayi || 0} kayıt)`}${t.net != null ? ` · net (K/Z − ücret + funding) ${sayi(t.net)} USDT` : ''}`;

  function botGecmisTablosu(g) {
    secimleriGuncelle(g.semboller, g.kollar, 'Bölüm');
    const satirlar = g.satirlar.map(s => {
      // 64.6: Binance "Trade History" sırası — Zaman · Sembol · Yön · Fiyat · Miktar · Ücret · Rol · Gerçekleşen kâr; sonra botun bölüm/sebebi
      const tr = AG.dom.satir([ts(s.zaman), String(s.symbol).split(':')[0], yonMetni(s.side), fiyat(s.fiyat), miktar(s.miktar), s.ucret == null ? '—' : sayi(s.ucret, 8),
        s.rol === 'maker' ? 'Maker' : s.rol === 'taker' ? 'Taker' : '—', s.kz == null ? '—' : sayi(s.kz, 8),
        kolAd(s.kol), s.neden || '—', s.kaynak === 'borsa' ? 'borsa ✓' : s.kaynak === 'spot' ? 'kâğıt spot' : 'defter']);
      if (s.fark != null) { tr.title = `mutabakat farkı: defter − borsa = ${miktar(s.fark)}`; tr.classList.add('tone-warning'); }
      hucreTon(tr, 2, s.side === 'buy' ? 'tone-success' : 'tone-danger');
      hucreTon(tr, 7, s.kz ? AG.fmt.tonSinifi(s.kz) : null);
      if (s.tradeId) tr.title = `${tr.title ? tr.title + ' · ' : ''}Binance emir no ${s.emirNo || '—'} · işlem no ${s.tradeId}`;
      return tiklanir(tr, s.symbol, s.zaman);
    });
    const m = g.sonMutabakat;
    return el('div', null, [
      el('div', { class: 'hint hint-sm mb-2', text: toplamMetni(g.toplamlar || { islem: g.toplam, ucret: 0, kz: 0, funding: null }) }),
      tablo(['Zaman', 'Sembol', 'Yön', 'Fiyat', 'Miktar', 'Ücret (USDT)', 'Rol', 'Gerçekleşen kâr', 'Bölüm', 'Sebep', 'Kaynak'], satirlar, 'Bu süzgeçte işlem yok.', 'bot-gecmis'),
      sayfaCubugu(g),
      el('div', { class: `hint hint-sm mb-0 mt-2 ${g.farkSayisi ? 'tone-warning' : ''}`,
        text: `Kaynak: botun kendi işlem kaydı (yalnız eklenir, silinmez); "borsa ✓" satırlar Binance "Trade History" (userTrades) kaydının kendisi — fiyat, miktar, ücret, rol ve gerçekleşen kâr Binance'ten · emir dolumu zamanında listelenir (Order History emrin verildiği zamanı gösterir)${m ? ` · son borsa mutabakatı ${ts(m.zaman)}${m.hata ? ` (hata: ${m.hata})` : ''}` : ''}${g.farkSayisi ? ` · ${g.farkSayisi} emirde defter ↔ borsa farkı` : ''} · satıra tıkla → grafik o mumda` }),
    ]);
  }

  function hesapGecmisTablosu(h) {
    secimleriGuncelle(h.semboller, h.kaynaklar, 'Kaynak');
    const satirlar = h.satirlar.map(k => {
      const fund = k.tur === 'funding';
      const tr = AG.dom.satir([ts(k.zaman), k.kaynak, k.symbol ? k.symbol.split(':')[0] : '—', fund ? 'Fonlama' : yonMetni(k.side), fund ? '—' : miktar(k.miktar), fund ? '—' : fiyat(k.fiyat),
        k.ucret == null ? '—' : `${sayi(k.ucret, 4)}${k.ucretBirim && k.ucretBirim !== 'USDT' ? ` ${k.ucretBirim}` : ''}`, k.kz == null ? '—' : sayi(k.kz), fund ? sayi(k.tutar, 4) : '—', k.neden || k.clientOrderId || '—']);
      hucreTon(tr, 3, fund ? 'tone-muted' : (k.side === 'buy' ? 'tone-success' : 'tone-danger'));
      hucreTon(tr, 7, k.kz ? AG.fmt.tonSinifi(k.kz) : null);
      hucreTon(tr, 8, fund ? AG.fmt.tonSinifi(k.tutar) : null);
      return k.symbol ? tiklanir(tr, k.symbol, k.zaman) : tr;
    });
    const s = h.sonSenkron;
    return el('div', null, [
      el('div', { class: 'hint hint-sm mb-2', text: toplamMetni(h.toplamlar) }),
      tablo(['Zaman', 'Kaynak', 'Sembol', 'Yön', 'Miktar', 'Fiyat', 'Ücret', 'Gerç. K/Z', 'Funding', 'Sebep / emir kimliği'], satirlar, 'Bu süzgeçte kayıt yok (ilk eşitleme sunucu açıldıktan 2 dk sonra; "Borsadan eşitle" ile hemen).', 'bot-hesap-gecmis'),
      sayfaCubugu(h),
      el('div', { class: `hint hint-sm mb-0 mt-2 ${s && s.hata ? 'tone-warning' : ''}`,
        text: `Kaynak: hesabın işlem kaydı — hesaptaki TÜM dolumlar (botlar, elle, acil) + funding; açılışta ve 15 dk'da bir borsadan eşitlenir${s ? ` · son eşitleme ${ts(s.zaman)}${s.hata ? ` (uyarı: ${s.hata})` : ''}` : ''}` }),
    ]);
  }

  // 67.5 "Pozisyon büyüklüğü" (eski "Dağılım geçmişi"): her bölümün açık pozisyon nominali (USDT) — kâr/zarar DEĞİL.
  const BOLUMLER = [['btc', 'BTC'], ['donchian', 'Trend takibi'], ['dca', 'Kademeli alım']];
  const BUYUKLUK_BASLIK = 'Her bölümün açık pozisyon büyüklüğü (USDT)';
  const BUYUKLUK_ALT = 'Kâr/zarar değildir; kademeli alım düşüşte ek alım yaptıkça büyür. Hesap değeri grafiği botun kartında.';
  /**
   * Saf: bölüm başına son değer ve dönem başına göre değişim (USDT nominal). Kâr/zarar verisi YOK — yalnız büyüklük.
   * @param kol ozsermayeKarsilastir().kol [{ gun, btc, donchian, dca }]
   * @returns [{ anahtar, ad, son, bas, degisim, basGun, sonGun }] (kol boşsa [])
   */
  function buyuklukOzeti(kol) {
    const l = (kol || []).filter(x => x && x.gun);
    if (!l.length) return [];
    const ilk = l[0], son = l[l.length - 1];
    const s = (x) => (Number.isFinite(+x) ? Math.abs(+x) : 0);
    return BOLUMLER.map(([k, ad]) => ({ anahtar: k, ad, bas: s(ilk[k]), son: s(son[k]), degisim: s(son[k]) - s(ilk[k]), basGun: ilk.gun, sonGun: son.gun }));
  }
  function performansIskelet() {
    return el('div', null, [
      el('div', { class: 'bt-metric-label mb-1', text: BUYUKLUK_BASLIK }),
      el('p', { class: 'hint hint-sm mb-2', text: BUYUKLUK_ALT }),
      el('div', { class: 'canvas-box canvas-260' }, [el('canvas', { id: 'portfoyKolGrafik', role: 'img', 'aria-label': 'Her bölümün açık pozisyon büyüklüğü zaman içinde (USDT)' })]),
      el('div', { id: 'portfoyKolOzet', class: 'mt-2' }),
      el('div', { id: 'portfoyGrafikNot', class: 'hint hint-sm mb-0 mt-2' }),
    ]);
  }
  function buyuklukOzetiCiz(kol) {
    const k = bul('portfoyKolOzet');
    if (!k) return;
    const oz = buyuklukOzeti(kol);
    if (!oz.length) { doldur(k, []); return; }
    const isaret = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + sayi(Math.abs(x), 0);
    doldur(k, [el('ul', { class: 'dk-bilgi mb-0' }, oz.map(o => el('li', null, [
      el('strong', { text: `${o.ad}: ` }), el('span', { class: 'sayi', text: `${sayi(o.son, 0)} USDT` }),
      el('span', { class: 'hint hint-sm', text: ` · ${o.basGun} başına göre ${isaret(o.degisim)} USDT` })
    ])))]);
  }

  async function performansYukle(zorla) {
    if (!zorla && Date.now() - durum.perfZaman < 60000) return;
    durum.perfZaman = Date.now();
    try {
      const r = await AG.api.bindirmeGrafik(durum.ad);
      if (!r.success) throw new Error(r.error);
      performansCiz(r.ozsermaye);
      buyuklukOzetiCiz(r.ozsermaye.kol);
      const n = bul('portfoyGrafikNot');
      if (n) n.textContent = !r.ozsermaye.egri.length ? 'Özsermaye kaydı henüz yok — bot her günlük çalışmada bir satır yazar.'
        : (r.ozsermaye.golgeEksik ? `simülasyon kaydı eksik gün: ${r.ozsermaye.golgeEksik}` : '');
    } catch (e) { const n = bul('portfoyGrafikNot'); if (n) n.textContent = `Performans verisi alınamadı: ${e.message}`; }
  }

  function performansCiz(oz) {
    if (typeof global.Chart === 'undefined') return;
    const p = AG.tema.palet();
    const eksen = { x: { grid: { color: p.grid }, ticks: { color: p.text, maxTicksLimit: 8 } }, y: { grid: { color: p.grid }, ticks: { color: p.text } } };
    const ortak = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: p.text } } } };
    const t1 = bul('portfoyOzsermayeGrafik'), t2 = bul('portfoyKolGrafik');
    if (ozGrafik) { ozGrafik.destroy(); ozGrafik = null; }
    if (kolGrafik) { kolGrafik.destroy(); kolGrafik = null; }
    const cizgi = (label, data, renk, ek = {}) => ({ label, data, borderColor: renk, backgroundColor: renk, borderWidth: 1.8, pointRadius: oz.egri.length < 30 ? 2 : 0, tension: 0.05, ...ek });
    if (t1) ozGrafik = new global.Chart(t1.getContext('2d'), { type: 'line', data: { labels: oz.egri.map(x => x.gun), datasets: [
      cizgi('Bot (gerçekleşen)', oz.egri.map(x => x.gercek), p.accent, { borderWidth: 2.2 }),
      cizgi('Simülasyon', oz.egri.map(x => x.golge), p.warn, { borderDash: [5, 3] }),
      cizgi('BTC al-tut', oz.egri.map(x => x.btc), p.muted, { borderDash: [2, 3] }),
    ] }, options: { ...ortak, scales: eksen } });
    const alan = (label, data, renk) => ({ label, data, borderColor: renk, backgroundColor: AG.tema.alfa(renk, 0.35), fill: true, pointRadius: 0, borderWidth: 1, tension: 0.05 });
    if (t2) kolGrafik = new global.Chart(t2.getContext('2d'), { type: 'line', data: { labels: oz.kol.map(x => x.gun), datasets: [
      alan('BTC', oz.kol.map(x => x.btc), p.warn), alan('Trend takibi', oz.kol.map(x => x.donchian), p.accent), alan('Kademeli alım', oz.kol.map(x => x.dca), p.info),
    ] }, options: { ...ortak, scales: { x: eksen.x, y: { ...eksen.y, stacked: true, title: { display: true, text: 'USDT (açık pozisyon büyüklüğü)', color: p.text } } } } });
  }

  // ── Çizim ───────────────────────────────────────────────────────────────
  /** Sekme ya da kapsam değişince iskeleti kurar; sonra tabloyu çizer (ya da veri ister). */
  function sekmeCiz(veriIste) {
    global.document.querySelectorAll('[data-bot-sekme]').forEach(d => {
      const a = d.getAttribute('data-bot-sekme') === durum.sekme;
      d.classList.toggle('active', a); d.setAttribute('aria-selected', a ? 'true' : 'false');
    });
    const kap = bul('botIslemIcerik');
    if (!kap) return;
    if (durum.sekme === 'performans') { doldur(kap, [performansIskelet()]); performansYukle(true); return; }
    const parcalar = [];
    if (durum.sekme === 'gecmis' && durum.son) parcalar.push(gecmisSuzgec(durum.son));
    parcalar.push(el('div', { id: 'botIslemTablo' }, [el('p', { class: 'hint hint-sm mb-0', text: durum.son ? '' : 'Yükleniyor…' })]));
    doldur(kap, parcalar);
    if (veriIste || !durum.son || ((durum.sekme === 'pozisyon' || durum.sekme === 'emir') && (!durum.binance || Date.now() - durum.binance.zaman > 15000))) yukle(true); else tabloCiz();
  }

  async function tabloCiz() {
    const yer = bul('botIslemTablo');
    const r = durum.son;
    if (!yer || !r) return;
    if (durum.sekme === 'pozisyon') doldur(yer, [pozisyonSekmesi(r)]);
    else if (durum.sekme === 'emir') doldur(yer, [emirSekmesi(r)]);
    else if (durum.sekme === 'gecmis') {
      if (durum.mod === 'bot') { doldur(yer, [botGecmisTablosu(r.gecmis)]); return; }
      try {
        const h = await AG.api.hesapIslemleri({ hesap: r.hesap, bas: durum.bas, bit: durum.bit, sembol: durum.sembol, kaynak: durum.kaynak, sayfa: durum.sayfa });
        if (!h.success) throw new Error(h.error);
        doldur(yer, [hesapGecmisTablosu(h)]);
      } catch (e) { doldur(yer, [AG.bildirim.hataKutusu(e.message, { baslik: 'Hesap kaydı alınamadı' })]); }
    }
  }

  async function yukle(zorla) {
    if (!bul('botIslemPaneli')) return;
    if (!zorla && Date.now() - durum.zaman < 15000) return;
    durum.zaman = Date.now();
    try {
      const r = await AG.api.bindirmeIslemler(durum.ad, { sayfa: durum.sayfa, sembol: durum.mod === 'bot' ? durum.sembol : '', kol: durum.kol,
        bas: durum.bas, bit: durum.bit, grafikSembol: (G() && G().sembol()) || '' });
      if (!r.success) throw new Error(r.error);
      if (durum.sekme === 'pozisyon' || durum.sekme === 'emir') await binanceYukle();
      const suzgecYok = !durum.son && durum.sekme === 'gecmis';
      durum.son = r;
      isaretler = r.isaretler || [];
      hizliGecis(r);
      imlecAboneligi();
      if (G()) G().isaretleriCiz();
      cizgileriCiz();
      if (durum.sekme === 'performans') performansYukle(false);
      else if (suzgecYok || (durum.sekme === 'gecmis' && !bul('selBotGecmisMod'))) sekmeCiz(false);
      else tabloCiz();
    } catch (e) {
      const yer = bul('botIslemTablo') || bul('botIslemIcerik');
      if (yer) doldur(yer, [AG.bildirim.hataKutusu(e.message, { baslik: 'Bot işlemleri alınamadı' })]);
    }
  }

  /** app.js: grafik sembolü/dilimi ya da tema değişti → işaret, çizgi ve düğmeleri yeniden kur. */
  function grafikDegisti() {
    if (!bul('botIslemPaneli')) return;
    imlecAboneligi();
    const yer = bul('botIsaretBilgi'); if (yer) yer.textContent = '';
    if (durum.son) hizliGecis(durum.son);
    yukle(true);                                   // yeni sembolün işaretleri + çizgileri
  }

  function kur() {
    const yer = bul('botIslemBotYer');
    if (!yer || yer.dataset.kuruldu) return;
    yer.dataset.kuruldu = '1';
    if (AG.pages.botlar && AG.pages.botlar.secili) durum.ad = AG.pages.botlar.secili();
    doldur(yer, [secici('selBotIslemBot', 'İşlemleri gösterilen bot', ADLAR, durum.ad, (v) => {
      durum.ad = v; durum.sayfa = 1; durum.sembol = ''; durum.kol = ''; durum.kaynak = ''; durum.son = null; durum.binance = null; isaretler = [];
      cizgileriTemizle(); if (G()) G().isaretleriCiz();
      sekmeCiz(true);
    })]);
    const sekmeler = bul('botIslemSekmeler');
    if (sekmeler) doldur(sekmeler, SEKMELER.map(([k, t]) => el('button', { type: 'button', class: 'dock-tab', role: 'tab', 'data-bot-sekme': k, 'aria-selected': 'false',
      onclick: () => { durum.sekme = k; durum.sayfa = 1; sekmeCiz(false); } }, [el('span', { text: t })])));
    sekmeCiz(false);
  }

  function goster(zorla) { kur(); yukle(zorla); }
  /** 62.6: Botlar sekmesi (js/pages/botlar.js sec) işlemleri gösterilen botu belirler. */
  function botSec(ad) {
    if (!ad || ad === durum.ad) return;
    durum.ad = ad; durum.sayfa = 1; durum.sembol = ''; durum.kol = ''; durum.kaynak = ''; durum.son = null; durum.binance = null; isaretler = [];
    const sel = bul('selBotIslemBot'); if (sel) sel.value = ad;
    cizgileriTemizle(); if (G()) G().isaretleriCiz();
    sekmeCiz(true);
  }
  global.document.addEventListener('ag:tema', () => { if (durum.sekme === 'performans') performansYukle(true); });

  AG.pages = AG.pages || {};
  AG.pages.bindirmeIslem = { buyuklukOzeti, BUYUKLUK_BASLIK, BUYUKLUK_ALT, SEKMELER, goster, yukle, grafikIsaretleri, grafikDegisti, botSec, _durum: durum };
})(typeof window !== 'undefined' ? window : globalThis);
