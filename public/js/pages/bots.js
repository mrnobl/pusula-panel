/**
 * BOTS SAYFASI — çalışan botlar, bot özeti kartı, izleme rozetleri
 * ═══════════════════════════════════════════════════════════════════════════
 * (`PLAN-MOTOR.md` §8, P3b)
 *
 * Üç çizici de saf VERİ → DOM: sunucuya gitmezler, durum tutmazlar, eylemi
 * çağıran geri çağrı olarak verir. `js/pages/dock.js` ile aynı sözleşme ve
 * aynı gerekçe — tarayıcısız sınanabilsinler.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TAŞINIRKEN KAPANAN KUSURLAR
 * ───────────────────────────────────────────────────────────────────────────
 * · `bot.id` ve `item.symbol`, `onclick="stopBot('…')"` biçiminde işaretlemeye
 *   gömülüyordu. Bot kimliğinde tek tırnak kaçırılmaya çalışılmıştı
 *   (`.replace(/'/g, "\\'")`) ama izleme listesi rozetinde o bile yoktu.
 *   Artık ikisi de gerçek dinleyici.
 * · Sinyal gerekçesi (`sig.reason`) stratejiden gelen SERBEST METİNDİR ve
 *   doğrudan işaretlemeye yazılıyordu.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  const dom = AG.dom;
  const fmt = AG.fmt;
  const el = (t, p, c) => dom.el(t, p, c);

  /**
   * "Kayıt yok" satırı. `sinif` verilmezse hücre KENDİ dolgusunu almaz —
   * `td`nin varsayılanıyla kalır; bots panelindeki tablo tam olarak böyleydi.
   */
  const bosSatir = (sutun, icerik, sinif) => {
    const props = {
      colspan: String(sutun),
      class: ('text-center tone-muted ' + (sinif || '')).trim()
    };
    // İçerik düz metin de olabilir, düğüm listesi de.
    if (typeof icerik === 'string') props.text = icerik;
    return el('tr', null, [el('td', props, Array.isArray(icerik) ? icerik : null)]);
  };

  /* ── 1. Bot özeti (Canlı İzleme "Çalışan Botlar" kartı) ─────────────── */
  /**
   * Eskiden aynı özet iki yerde vardı (kart + tablonun başlık şeridi).
   * Tek yer: kart. "MOTOR DURUK" ayrımı burada — bot tanımlı ama motor
   * koşmuyorsa panel "3 bot çalışıyor" deyip hiçbiri işlem yapmıyor olmasın.
   * @returns {{ deger: string, alt: string, ton: string }}
   */
  function botOzeti(bots, motorCalisiyor) {
    const liste = Array.isArray(bots) ? bots : [];
    if (!liste.length) return { deger: '0', alt: 'Bot çalışmıyor', ton: 'tone-warning' };
    const varlikSayisi = new Set(liste.map(b => b.symbol)).size;
    const kurulumlar = Array.from(new Set(liste.map(b => `${b.strategyName || b.strategy} · ${b.timeframe}`)));
    const kurulum = kurulumlar.length === 1 ? kurulumlar[0] : `${kurulumlar.length} farklı kurulum`;
    if (!motorCalisiyor) return { deger: String(liste.length), alt: `MOTOR DURUK · ${kurulum}`, ton: 'tone-warning' };
    return { deger: String(liste.length), alt: `${varlikSayisi} varlık · ${kurulum}`, ton: 'tone-strong' };
  }

  /* ── 2. Çalışan botlar tablosu ──────────────────────────────────────── */
  function calisanBotlar(state, motorCalisiyor, durdurIstegi) {
    const tbody = global.document.querySelector('#tblActiveBotsList tbody');
    if (!tbody || !state) return;

    const bots = Array.isArray(state.bots) ? state.bots : [];
    const tickerMap = state.tickerMap || {};
    const positions = (state.balances && state.balances.positions) ? state.balances.positions : [];

    if (bots.length === 0) {
      dom.doldur(tbody, [bosSatir(7, [
        global.document.createTextNode('Çalışan bot yok. Strateji ve zaman dilimini seçip varlık işaretleyerek '),
        el('strong', { text: '“Kâğıt botları başlat”' }),
        global.document.createTextNode(' ile başlatın.')
      ], 'empty-cell-sm')]);
      return;
    }

    const satirlar = bots.map(bot => {
      const ticker = tickerMap[bot.symbol] || (bot.symbol === state.symbol ? state.ticker : null);
      const sonFiyat = ticker ? (ticker.last || 0) : 0;

      // Yalnızca BU botun kendi lotları.
      const kendi = positions.filter(p => p.botId === bot.id);
      const miktar = kendi.reduce((a, p) => a + (p.amount || 0), 0);
      const kz = kendi.reduce((a, p) => a + (p.pnlUSDT || 0), 0);

      const sig = bot.signal || { action: 'HOLD', reason: 'Analiz ediliyor...' };
      let sigTon = 'tone-warning';
      if (sig.action === 'BUY') sigTon = 'tone-success';
      else if (sig.action === 'SELL') sigTon = 'tone-danger';

      const pozHucre = miktar > 0
        ? el('span', {
          class: `fw-bold ${fmt.tonSinifi(kz)}`,
          text: `${miktar.toFixed(6)} (${kz >= 0 ? '+' : ''}$${kz.toFixed(2)})`
        })
        : el('span', { class: 'tone-muted', text: 'Nakit' });

      const durdur = el('button', {
        class: 'btn btn-danger btn-xs',
        title: 'Bu botu durdur',
        text: '⛔ Durdur',
        onclick: () => durdurIstegi && durdurIstegi(bot.id)
      });

      return el('tr', null, [
        el('td', null, [el('strong', { class: 'tone-cyan', text: `⚡ ${bot.symbol}` })]),
        el('td', null, [el('span', { class: 'badge tint-primary', text: bot.strategyName || bot.strategy })]),
        el('td', null, [el('span', { class: 'badge tint-cyan-soft fw-bold', text: bot.timeframe })]),
        el('td', null, [el('strong', {
          text: sonFiyat > 0
            ? '$' + sonFiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })
            : '—'
        })]),
        el('td', null, [
          el('span', { class: `sig-action ${sigTon}`, text: sig.action }),
          el('span', { class: 'sig-reason', text: `(${sig.reason || 'Sinyal Bekleniyor'})` })
        ]),
        el('td', null, [pozHucre]),
        el('td', { class: 'text-center' }, [durdur])
      ]);
    });

    dom.doldur(tbody, satirlar);
  }

  /* ── 3. İzleme listesi rozetleri (Ayarlar → İzleme listesi) ────────────────────────────────────── */
  function izlemeRozetleri(items, timeframe, tfEtiket, cikarIstegi) {
    const kap = global.document.getElementById('watchlistBadgeContainer');
    if (!kap) return;

    if (!items || items.length === 0) {
      dom.doldur(kap, [el('span', {
        class: 'hint text-base',
        text: 'İzleme listeniz henüz boş. Yukarıdaki alandan varlık ekleyin.'
      })]);
      return;
    }

    const rozetler = items.map(item => {
      const mumSayisi = item.cachedCandles || 0;
      const durumTon = mumSayisi > 0 ? 'tone-success' : 'tone-warning';
      const durumMetni = mumSayisi > 0
        ? `🟢 ${mumSayisi} Mum (${timeframe})`
        : `🟡 Önbellek Yok (${timeframe})`;

      return el('div', {
        class: 'wl-chip',
        title: `${item.symbol} için ${tfEtiket} önbellek durumu`
      }, [
        el('strong', { class: 'wl-symbol', text: item.symbol }),
        el('span', { class: `wl-status ${durumTon}`, text: durumMetni }),
        // Denetim A-03: onaylı silme (onay app.js removeWatchlistSymbol'da) + en az 32×32 dokunma alanı (CSS sonu).
        el('button', {
          type: 'button',
          class: 'wl-remove',
          title: `${item.symbol} listeden çıkar`,
          'aria-label': `${item.symbol} izleme listesinden çıkar`,
          text: '✖',
          onclick: () => cikarIstegi && cikarIstegi(item.symbol)
        })
      ]);
    });

    dom.doldur(kap, rozetler);
  }

  AG.pages = AG.pages || {};
  AG.pages.bots = { botOzeti, calisanBotlar, izlemeRozetleri };

  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.bots;
})(typeof window !== 'undefined' ? window : globalThis);
