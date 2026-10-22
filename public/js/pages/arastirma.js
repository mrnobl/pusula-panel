/**
 * STRATEJİ ÖLÇÜMÜ — Stratejiler sekmesinin "Ölçüm" bölümü.
 * ═══════════════════════════════════════════════════════════════════════════
 * Kaynak: `lib/research/adaylar.js` (kayıtlı ölçüm) ve `/api/strateji/olc`
 * (`lib/research/donchianPortfoy.js`, `kitapOlcum.js` — betikle aynı motor).
 *
 * Kurallar:
 *   · Her adayın kill kriteri ölçümden ÖNCE yazıldı; burada yalnız gösterilir.
 *   · Kayıtlı sonuç ve yeniden ölçüm yan yana durur — veri güncellenince
 *     sayılar değişebilir, hangisinin hangisi olduğu görünür kalmalı.
 *   · Emir göndermez. Canlıya geçiş Borsa sekmesinden, ayrı onayla.
 * Eski ayrı "Araştırma" sekmesinin kart ızgarası Stratejiler listesine katıldı
 * (`js/pages/stratejiler.js`); burada yalnız seçili stratejinin ölçümü çizilir.
 * Tüm DOM `AG.dom.el` ile kurulur — sunucu metni işaretlemeye girmez.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  /** 72.0: aday/kayıt adı eski bot adıyla gelebilir → yeni ad (AG.botAd). */
  const cv = (t) => (AG && AG.botAd ? AG.botAd.cevir(t) : t);
  const { el, doldur, bul } = AG.dom;

  let grafik = null;
  let sonGrafik = null;
  let adaySozu = null;

  // Eksi işareti yüzde simgesinin ÖNÜNDE: "-%6.3" ("%-6.3" değil).
  const yuzde = (x, b = 1) => (x == null || Number.isNaN(+x) ? '—' : `${x < 0 ? '-' : ''}%${Math.abs(x * 100).toFixed(b)}`);
  const isaretliYuzde = (x, b = 1) => (x == null ? '—' : `${x > 0 ? '+' : ''}${yuzde(x, b)}`);
  const sayi = (x, b = 2) => (x == null || Number.isNaN(+x) ? '—' : (+x).toFixed(b));
  const ton = (x) => (x == null ? '' : x >= 0 ? 'tone-success' : 'tone-danger');

  const DURUM = {
    'GEÇTİ': { sinif: 'badge badge-success', metin: '✅ Geçti' },
    'BEKLET': { sinif: 'badge badge-warning', metin: '⏸ Beklet' },
    'ÖLDÜ': { sinif: 'badge badge-danger', metin: '❌ Elendi' }
  };
  const rozet = (d) => el('span', { class: (DURUM[d] || {}).sinif || 'badge', text: (DURUM[d] || {}).metin || d });

  const bildir = (m, t) => (AG.bildir ? AG.bildir(m, t || 'bilgi') : global.alert(m));

  /** Ölçüm kayıtları bir kez çekilir; liste ve ayrıntı aynı sonucu paylaşır. */
  function adaylariGetir() {
    if (!adaySozu) {
      adaySozu = AG.api.stratejiAdaylari().then(r => {
        if (!r.success) throw new Error(r.error);
        return r.adaylar || [];
      }).catch(e => { adaySozu = null; throw e; });
    }
    return adaySozu;
  }

  /** Kayıtlı ölçümün özet satırları. */
  function kayitSatirlari(a) {
    const k = a.kayit || {};
    const satirlar = [];
    if (k.sharpe != null) {
      satirlar.push(['Sharpe (net)', `${sayi(k.sharpe)}${k.alTutSharpe != null ? ` · al-tut ${sayi(k.alTutSharpe)}` : ''}`]);
    }
    if (k.maxDD != null) satirlar.push(['En büyük düşüş', `${yuzde(k.maxDD)}${k.alTutMaxDD != null ? ` · al-tut ${yuzde(k.alTutMaxDD)}` : ''}`]);
    if (k.cagr != null) satirlar.push(['Yıllık getiri', yuzde(k.cagr)]);
    if (k.oosSharpe != null) satirlar.push(['Yayın sonrası (2025-06 →)', `Sharpe ${sayi(k.oosSharpe)} · ${isaretliYuzde(k.oosCagr)}/yıl`]);
    if (k.dealBrut != null) satirlar.push(['Deal başına brüt', `${isaretliYuzde(k.dealBrut, 2)} (long ${isaretliYuzde(k.longBrut, 2)} · short ${isaretliYuzde(k.shortBrut, 2)})`]);
    if (k.pozitif) satirlar.push(['Pozitif varlık', k.pozitif]);
    if (k.korelasyon != null) satirlar.push(['Donchian ile korelasyon', sayi(k.korelasyon)]);
    if (k.islem != null && k.dealBrut == null) satirlar.push(['İşlem', String(k.islem)]);
    if (k.donem) satirlar.push(['Dönem', k.donem]);
    return satirlar;
  }

  /**
   * Bir stratejinin ölçüm bölümü. Birden çok kayıt varsa (Donchian: portföy /
   * yalnız BTC / yalnız ETH) üstte seçici çıkar.
   */
  function olcumCiz(kutu, kayitlar, seciliAnahtar) {
    if (!kutu) return;
    if (!kayitlar || !kayitlar.length) {
      doldur(kutu, [el('p', {
        class: 'tone-muted',
        text: 'Bu strateji için kayıtlı ölçüm yok. Araştırma › Backtest ekranında walk-forward ile ölçülebilir; kill kriteri ölçümden ÖNCE yazılmalı.'
      })]);
      return;
    }
    const a = kayitlar.find(x => x.anahtar === seciliAnahtar) || kayitlar[0];
    const parcalar = [];
    if (kayitlar.length > 1) {
      parcalar.push(el('div', { class: 'row row-wrap gap-2 mb-5', role: 'group', 'aria-label': 'Ölçüm kaydı' },
        kayitlar.map(x => el('button', {
          type: 'button',
          class: `btn btn-sm ${x.anahtar === a.anahtar ? 'btn-primary' : 'btn-secondary'}`,
          'aria-pressed': x.anahtar === a.anahtar ? 'true' : 'false',
          onclick: () => olcumCiz(kutu, kayitlar, x.anahtar)
        }, [el('span', { text: cv(x.ad) })]))));
    }
    parcalar.push(el('div', { class: 'row-between row-wrap gap-5 mb-3' }, [el('strong', { text: cv(a.ad) }), rozet(a.durum)]));
    if (a.ozet) parcalar.push(el('p', { class: 'hint hint-sm mb-5', text: cv(a.ozet) }));
    const satirlar = kayitSatirlari(a);
    if (satirlar.length) {
      parcalar.push(el('div', { class: 'bt-metric-label mb-2', text: 'Kayıtlı ölçüm' }));
      parcalar.push(el('dl', { class: 'kv-list mb-7' }, satirlar.flatMap(([x, y]) => [el('dt', { text: x }), el('dd', { text: y })])));
    }
    if (a.olcum) {
      const dugme = el('button', { type: 'button', class: 'btn btn-primary', onclick: () => olc(a, dugme) }, [
        el('span', { text: 'Güncel veriyle yeniden ölç' })
      ]);
      parcalar.push(el('div', { class: 'row row-wrap gap-5 mb-5' }, [
        dugme,
        el('span', { class: 'hint hint-sm', text: 'Yerel veritabanındaki perp mumları ve funding kayıtlarıyla; birkaç saniye sürer.' })
      ]));
      parcalar.push(el('div', { id: 'arastirmaSonuc' }));
    } else {
      parcalar.push(el('p', { class: 'hint', text: 'Bu kayıt panelden yeniden ölçülemiyor; ölçüm betiği ve ayrıntı proje belgelerinde.' }));
    }
    doldur(kutu, parcalar);
  }

  async function olc(a, dugme) {
    AG.dom.mesgul && AG.dom.mesgul(dugme, 'Ölçülüyor…');
    try {
      const r = await AG.api.stratejiOlc(a.anahtar);
      if (!r.success) throw new Error(r.error);
      sonucCiz(a, r.sonuc);
    } catch (e) {
      bildir('Ölçüm yapılamadı: ' + e.message, 'hata');
    } finally {
      AG.dom.hazir && AG.dom.hazir(dugme);
    }
  }

  const tablo = (basliklar, satirlar) => AG.tablo.kutulu({ basliklar, satirlar });

  function hucreTon(tr, i, sinif) { if (tr.children[i] && sinif) tr.children[i].className = sinif; return tr; }

  function kitapSonucCiz(a, s) {
    const kutu = bul('arastirmaSonuc');
    const m = s.metrik;
    doldur(kutu, [
      el('div', { class: 'row-between row-wrap gap-5 mb-5' }, [
        el('div', { class: 'row gap-3' }, [el('strong', { text: 'Yeniden ölçüm sonucu:' }), rozet(s.karar)]),
        el('span', { class: 'mono-note', text: `${s.varlikSayisi} varlık · ${s.donem.bas} → ${s.donem.bit} · ${s.islem} işlem · perp 1x · taker %0,05 + gerçek funding · boyut: ${s.boyutlama === 'portfoyRiski' ? 'portföy riski (kârlar toplanır)' : 'sermaye payı (eşit ağırlık)'}` })
      ]),
      el('div', { class: 'grid-2 mb-7' }, [
        el('div', null, [
          el('div', { class: 'bt-metric-label mb-2', text: 'Portföy (net)' }),
          tablo(['Sharpe', 'Yıllık', 'En büyük düşüş', 'Toplam', 'Donchian kor.'], [AG.dom.satir([sayi(m.sharpe), yuzde(m.cagr), yuzde(m.maxDD), yuzde(m.toplam, 0), s.donchianKorelasyon == null ? '—' : sayi(s.donchianKorelasyon)])])
        ]),
        el('div', null, [
          el('div', { class: 'bt-metric-label mb-2', text: 'Kill kriterleri (ölçümden önce yazıldı)' }),
          tablo(['#', 'Kriter', 'Değer', 'Durum'], s.kriterler.map(k => AG.dom.satir([String(k.no), k.ad,
            k.deger == null ? '—' : (Math.abs(k.deger) < 2 && k.no !== 4 && k.no !== 3 ? (k.no === 1 ? sayi(k.deger) : yuzde(k.deger, 0)) : String(k.deger)),
            k.gecti ? '✅ geçti' : (k.sonuc === 'BEKLET' ? '⏸ beklet' : '❌ öldür')], { class: k.gecti ? null : 'row-bad' })))
        ])
      ]),
      el('div', { class: 'bt-metric-label mb-2', text: 'Portföy özsermayesi (başlangıç = 1)' }),
      el('div', { class: 'canvas-box canvas-260 mb-7' }, [el('canvas', { id: 'arastirmaGrafik', role: 'img', 'aria-label': 'Özsermaye eğrisi' })]),
      el('div', { class: 'grid-2 mb-7' }, [
        el('div', null, [
          el('div', { class: 'bt-metric-label mb-2', text: 'Yıllık getiri' }),
          tablo(['Yıl', 'Getiri'], s.yillik.map(y => hucreTon(AG.dom.satir([String(y.yil), isaretliYuzde(y.getiri)]), 1, ton(y.getiri))))
        ]),
        el('div', null, [
          el('div', { class: 'bt-metric-label mb-2', text: 'Varlık başına (ölçüm döneminde)' }),
          tablo(['Varlık', 'Getiri', 'İşlem'], s.varliklar.map(v => hucreTon(AG.dom.satir([v.sembol.replace(':USDT', ''), isaretliYuzde(v.getiri), String(v.islem)]), 1, ton(v.getiri))))
        ])
      ])
    ]);
    grafikCiz({ egri: { strateji: s.egri, alTut: null } });
  }

  function sonucCiz(a, s) {
    const kutu = bul('arastirmaSonuc');
    if (!kutu) return;
    if (s.tur === 'kitap') return kitapSonucCiz(a, s);
    const m = s.metrik;
    const metrikSatir = (ad, x) => hucreTon(AG.dom.satir([ad, sayi(x && x.sharpe), yuzde(x && x.cagr), yuzde(x && x.maxDD), yuzde(x && x.toplam, 0)]), 2, ton(x && x.cagr));

    const kriterDeger = (k) => (k.no === 1 ? `${sayi(k.deger)} (al-tut ${sayi(k.kiyas)})` : yuzde(k.deger, 0));
    const kriterler = s.kriterler.map(k => AG.dom.satir([
      String(k.no), k.ad, kriterDeger(k),
      k.gecti ? '✅ geçti' : (k.sonuc === 'BEKLET' ? '⏸ beklet' : '❌ öldür')
    ], { class: k.gecti ? null : 'row-bad' }));

    const hedefler = s.hedefler.map(h => AG.dom.satir([
      h.sembol.replace(':USDT', ''),
      h.kapanis == null ? '—' : String(+h.kapanis.toPrecision(6)),
      h.acikAltModel == null ? '—' : `${h.acikAltModel}/${h.altModel}`,
      h.vol == null ? '—' : yuzde(h.vol, 0),
      h.varlikMaruziyeti == null ? '—' : `${sayi(h.varlikMaruziyeti)}x`,
      `${sayi(h.portfoyAgirligi * 100, 1)}%`
    ]));
    const toplamAgirlik = s.hedefler.reduce((t, h) => t + h.portfoyAgirligi, 0);

    const kayit = a.kayit || {};
    const fark = kayit.sharpe != null && Math.abs(kayit.sharpe - m.strateji.sharpe) >= 0.02;

    doldur(kutu, [
      el('div', { class: 'row-between row-wrap gap-5 mb-5' }, [
        el('div', { class: 'row gap-3' }, [el('strong', { text: 'Yeniden ölçüm sonucu:' }), rozet(s.karar)]),
        el('span', { class: 'mono-note', text: `${s.semboller.length} varlık · ${s.donem.bas} → ${s.donem.bit} · ${s.islem} işlem · ücret+kayma ${yuzde(s.ucretPay, 2)} · funding ${yuzde(s.fundingPay, 2)} (başlangıç sermayesine göre)` })
      ]),
      fark ? el('p', { class: 'text-warn mb-5', text: `Kayıtlı Sharpe ${sayi(kayit.sharpe)}, bugünkü ölçüm ${sayi(m.strateji.sharpe)} — veri ${kayit.donem || ''} sonrasına uzadığı için fark normal.` }) : null,
      el('div', { class: 'grid-2 mb-7' }, [
        el('div', null, [
          el('div', { class: 'bt-metric-label mb-2', text: 'Performans (net, maliyet ve funding dahil)' }),
          tablo(['Koşu', 'Sharpe', 'Yıllık', 'En büyük düşüş', 'Toplam'], [
            metrikSatir('Strateji', m.strateji),
            metrikSatir('Vol hedefli al-tut', m.alTut),
            metrikSatir('Strateji · yayın öncesi', m.yayinOncesi),
            metrikSatir(`Strateji · yayın sonrası (${s.donem.yayin} →)`, m.yayinSonrasi),
            metrikSatir('Al-tut · yayın sonrası', m.alTutYayinSonrasi)
          ])
        ]),
        el('div', null, [
          el('div', { class: 'bt-metric-label mb-2', text: 'Kill kriterleri (ölçümden önce yazıldı)' }),
          tablo(['#', 'Kriter', 'Değer', 'Durum'], kriterler)
        ])
      ]),
      el('div', { class: 'bt-metric-label mb-2', text: 'Özsermaye eğrisi — strateji ve vol hedefli al-tut (başlangıç = 1)' }),
      el('div', { class: 'canvas-box canvas-260 mb-7' }, [el('canvas', { id: 'arastirmaGrafik', role: 'img', 'aria-label': 'Özsermaye eğrisi' })]),
      el('div', { class: 'grid-2 mb-7' }, [
        el('div', null, [
          el('div', { class: 'bt-metric-label mb-2', text: 'Yıllık getiri' }),
          tablo(['Yıl', 'Getiri'], s.yillik.map(y => hucreTon(AG.dom.satir([String(y.yil), isaretliYuzde(y.getiri)]), 1, ton(y.getiri))))
        ]),
        el('div', null, [
          el('div', { class: 'bt-metric-label mb-2', text: s.tekVarlik ? 'Alt model duyarlılığı (biri çıkarılınca)' : 'Varlık duyarlılığı (biri çıkarılınca)' }),
          tablo(['Çıkarılan', 'Sharpe', 'Değişim'], s.duyarlilik.map(d => AG.dom.satir([d.ad.replace(':USDT', ''), sayi(d.sharpe), yuzde(d.degisim, 0)],
            { class: d.degisim > 0.3 ? 'row-bad' : null })))
        ])
      ]),
      el('div', { class: 'bt-metric-label mb-2', text: `Son kapanmış gün (${s.veriSonGun}) — stratejinin istediği pozisyonlar` }),
      tablo(['Varlık', 'Kapanış', 'Açık alt model', '30 gün vol', 'Varlık maruziyeti', 'Portföy ağırlığı'], hedefler),
      el('p', { class: 'hint hint-sm mt-3', text: `Toplam maruziyet ${sayi(toplamAgirlik * 100, 1)}% (özsermayenin yüzdesi, nominal). Bu tablo bilgi amaçlıdır; emir göndermez. Veri ${s.veriSonGun} tarihine kadar — güncel karar için Arşiv'deki Donchian botu "Kuru hesapla" ile borsadan okur.` })
    ]);
    grafikCiz(s);
  }

  function grafikCiz(s) {
    const tuval = bul('arastirmaGrafik');
    if (!tuval || typeof global.Chart === 'undefined') return;
    if (grafik) { grafik.destroy(); grafik = null; }
    sonGrafik = s;
    const p = AG.tema ? AG.tema.palet() : { pos: '#0ecb81', muted: '#7c8695', grid: 'rgba(127,127,127,0.15)', text: '#8a94a3' };
    grafik = new global.Chart(tuval.getContext('2d'), {
      type: 'line',
      data: {
        labels: s.egri.strateji.map(x => x.t),
        datasets: [
          { label: 'Strateji', data: s.egri.strateji.map(x => x.oz), borderColor: p.pos, borderWidth: 2, pointRadius: 0, tension: 0.1 },
          s.egri.alTut ? { label: 'Vol hedefli al-tut', data: s.egri.alTut.map(x => x.oz), borderColor: p.muted, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.1 } : null
        ].filter(Boolean)
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: p.text } } },
        scales: {
          x: { grid: { color: p.grid }, ticks: { color: p.text, maxTicksLimit: 8 } },
          y: { type: 'logarithmic', grid: { color: p.grid }, ticks: { color: p.text } }
        }
      }
    });
  }

  // Tema değişince tuval CSS'i izlemez: son grafik yeni renklerle yeniden çizilir.
  global.document.addEventListener('ag:tema', () => { if (sonGrafik) grafikCiz(sonGrafik); });

  AG.pages = AG.pages || {};
  AG.pages.arastirma = { adaylariGetir, olcumCiz, sonucCiz };
})(typeof window !== 'undefined' ? window : globalThis);
