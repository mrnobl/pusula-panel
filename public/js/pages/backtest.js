/**
 * BACKTEST SONUÇ TABLOLARI (`PLAN-MOTOR.md` §8, P3b)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Optimizasyon sıralaması · izleme listesi taraması · walk-forward künyesi.
 * Üçü de saf VERİ → DOM; sunucuya gitmez, durum tutmaz, eylemi çağıran verir.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TAŞINIRKEN KAPANAN KUSURLAR
 * ───────────────────────────────────────────────────────────────────────────
 * · Düğmeler `onclick="inspectSingleBacktest(${idx})"` diye işaretlemeye
 *   gömülüyordu; sıra numarası HTML'e yazılıp geri okunuyordu. Artık
 *   kapanışta taşınıyor.
 * · Satır vurgusu ve renkler inline `style` ile veriliyordu.
 * · Walk-forward künyesinde YEDİ ayrı `element.style.color` ataması vardı.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  /** 72.0: kayıtlı strateji adı eski bot adıyla olabilir → yeni ad (AG.botAd). */
  const cv = (t) => (AG.botAd ? AG.botAd.cevir(t) : t);
  const dom = AG.dom;
  const fmt = AG.fmt;
  const el = (t, p, c) => dom.el(t, p, c);

  const yuzdeTon = (n) => (Number(n) >= 0 ? 'tone-success' : 'tone-danger');

  /**
   * Sunucunun gönderdiği CSS rengini ton sınıfına çevirir.
   *
   * ⚠ `lib/backtest/optimize.js` yanıtın içine `statusColor: 'var(--accent-…)'`
   * koyuyor — yani SUNUM kararı motorun içinden çıkıyor. Panelin doğru
   * davranışı bunu olduğu gibi bir `style` yazmak değil, kendi ton sınıfına
   * eşlemek. Motor tarafındaki alanın emekli edilmesi ayrı bir iş.
   */
  function tonSinifi(renk) {
    // Eşleme `AG.fmt.renkTonu`da — panelde ikinci bir renk sözlüğü olmasın.
    return fmt.renkTonu(renk) || 'tone-success';
  }

  /* ── 1. Optimizasyon sıralaması ─────────────────────────────────────── */
  function optimizasyonSonuclari(rankings, paramOzeti, incele, uygula) {
    const tbody = global.document.querySelector('#tblOptimizationResults tbody');
    if (!tbody || !rankings) return;

    const satirlar = rankings.map((item, idx) => {
      const enIyi = idx === 0;

      const dugmeler = el('div', { class: 'row-plain gap-2' }, [
        el('button', {
          class: 'btn btn-secondary btn-opt', text: '📊 Backtest Gör',
          onclick: () => incele && incele(idx)
        }),
        el('button', {
          class: 'btn btn-primary btn-opt', text: 'Bota yükle', title: 'Bu ayarı stratejinin kayıtlı parametrelerine yaz (bot başlatılmaz)',
          onclick: () => uygula && uygula(idx)
        })
      ]);

      return el('tr', { class: enIyi ? 'row-best' : null }, [
        el('td', null, [el('strong', { text: enIyi ? '🏆 EN İYİ' : `#${idx + 1}` })]),
        el('td', null, [el('strong', { class: 'tone-warning', text: String(item.score) })]),
        el('td', {
          class: `fw-bold ${yuzdeTon(item.totalReturnPct)}`,
          text: `%${item.totalReturnPct}`
        }),
        el('td', { text: `%${item.winRatePct}` }),
        el('td', { text: String(item.sharpeRatio) }),
        el('td', { class: 'tone-danger', text: `-%${item.maxDrawdownPct}` }),
        el('td', { class: 'cell-mono', text: paramOzeti(item.config) }),
        el('td', null, [dugmeler])
      ]);
    });

    dom.doldur(tbody, satirlar);
  }

  /* ── 2. İzleme listesi taraması ─────────────────────────────────────── */
  function izlemeTaramasi(firsatlar, incele, uygula) {
    const tbody = global.document.querySelector('#tblWatchlistResults tbody');
    if (!tbody || !firsatlar) return;

    const satirlar = firsatlar.map((item, idx) => {
      const m = item.metrics;
      const sampiyon = idx === 0;

      const dugmeler = el('div', { class: 'row-plain gap-2' }, [
        el('button', {
          class: 'btn btn-secondary btn-wl', text: '📊 Backtest Detayı Gör',
          onclick: () => incele && incele(idx)
        }),
        el('button', {
          class: 'btn btn-primary btn-wl btn-grad-scan', text: 'Bota yükle', title: 'Bu ayarı stratejinin kayıtlı parametrelerine yaz (bot başlatılmaz)',
          onclick: () => uygula && uygula(idx)
        })
      ]);

      return el('tr', { class: sampiyon ? 'row-champion' : null }, [
        el('td', null, [el('strong', { text: sampiyon ? '🏆 #1 ŞAMPİYON' : `#${idx + 1}` })]),
        el('td', null, [el('strong', { class: 'tone-strong cell-1r', text: item.symbol })]),
        el('td', null, [el('span', { class: 'tone-cyan fw-semibold', text: cv(item.strategyName) })]),
        el('td', null, [el('strong', { class: 'tone-warning', text: String(m.score) })]),
        el('td', {
          class: `fw-bold cell-1r ${yuzdeTon(m.totalReturnPct)}`,
          text: `%${m.totalReturnPct}`
        }),
        el('td', { text: `%${m.winRatePct}` }),
        el('td', { text: String(m.sharpeRatio) }),
        el('td', { class: 'tone-danger', text: `-%${m.maxDrawdownPct}` }),
        el('td', null, [dugmeler])
      ]);
    });

    dom.doldur(tbody, satirlar);
  }

  /* ── 3. Walk-forward raporu ─────────────────────────────────────────── */
  // Eksi işareti yüzde simgesinin ÖNÜNDE: "-%0.25" ("%-0.25" değil).
  const yuzdeYaz = (n, b) => `${n < 0 ? '-' : ''}%${Math.abs(Number(n)).toFixed(b)}`;
  const isaretli = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${yuzdeYaz(n, 2)}`);
  const gun = (iso) => (iso ? String(iso).slice(0, 10) : '—');

  /**
   * WFE eşikleri motorun kabul karnesiyle AYNI (`lib/backtest/optimize.js`
   * WF_ESIK: ≥50 geçer; <25 ve negatif test KALDI). Panelde farklı eşik
   * kullanmak aynı koşuyu iki yerde farklı yorumlardı.
   */
  const wfeTon = (v) => (v == null ? 'tone-muted' : v >= 50 ? 'tone-success' : (v >= 25 ? 'tone-warning' : 'tone-danger'));

  function walkForward(wf) {
    if (!wf) return;
    const bul = (id) => global.document.getElementById(id);

    const yaz = (id, metin, ton) => {
      const e = bul(id);
      if (!e) return;
      e.textContent = metin;
      if (ton) e.className = ton;
    };

    const durumTon = tonSinifi(wf.statusColor);
    yaz('txtWfStatusBadge', wf.overfittingStatus, durumTon);
    yaz('txtWfOverfitRisk', wf.overfittingStatus, durumTon);

    const kat = wf.katSayisi || 1;
    const ic = (wf.inSampleMetrics && wf.inSampleMetrics.totalReturnPct) || 0;
    yaz('txtWfInReturn', isaretli(ic), yuzdeTon(ic));
    yaz('txtWfInCandles', `${wf.inSampleCount || 0} mumluk pencere · ${kat} kat ortalaması`);

    const dis = (wf.outOfSampleMetrics && wf.outOfSampleMetrics.totalReturnPct) || 0;
    const disIslem = wf.outOfSampleMetrics && wf.outOfSampleMetrics.totalTrades;
    yaz('txtWfOutReturn', isaretli(dis), yuzdeTon(dis));
    yaz('txtWfOutCandles', `${wf.outOfSampleCount || 0} mum (son %30)${disIslem != null ? ` · ${disIslem} işlem` : ''}`);

    // `wfe` null = eğitimde kâr yok; oran tanımsız, sıfır gibi gösterilmez.
    const wfe = wf.wfe !== undefined ? wf.wfe : wf.efficiencyRatio;
    yaz('txtWfEfficiency', wfe == null ? 'tanımsız' : yuzdeYaz(wfe, 1), wfeTon(wfe));

    const kunye = [
      wf.symbol, wf.timeframe, cv(wf.strategyName),
      `${wf.totalCandles || 0} mum`,
      wf.yontem === 'tek-bolme' ? 'tek bölme' : `${kat} katlı kayan pencere`,
      wf.isinmaBar ? `ısınma ${wf.isinmaBar} bar` : null,
      wf.testedPermutations ? `${wf.testedPermutations} ayar denendi` : null
    ].filter(Boolean).join(' · ');
    yaz('txtWfKunye', kunye);

    const kriterGovde = bul('wfKriterGovde');
    if (kriterGovde) {
      dom.doldur(kriterGovde, (wf.kriterler || []).map(k => {
        const durum = k.gecti === true ? '✅ geçti' : (k.gecti === false ? '❌ kaldı' : '— ölçülmedi');
        const deger = k.deger == null ? '—' : yuzdeYaz(k.deger, k.deger % 1 ? 2 : 0);
        return dom.satir([k.ad, deger, k.esik, k.not ? `${durum} (${k.not})` : durum],
          { class: k.gecti === false ? 'row-bad' : null });
      }));
    }

    const uyariKutu = bul('wfUyarilar');
    if (uyariKutu) {
      const u = wf.uyarilar || [];
      dom.doldur(uyariKutu, u.length
        ? u.map(m => el('p', { class: 'text-warn m-0 mb-2', text: `⚠ ${m}` }))
        : [el('p', { class: 'tone-muted m-0', text: 'Uyarı yok.' })]);
    }

    const katGovde = bul('wfKatlarGovde');
    if (katGovde) {
      dom.doldur(katGovde, (wf.katlar || []).map(k => {
        const tr = dom.satir([
          `#${k.kat}`,
          `${gun(k.egitim && k.egitim.bas)} → ${gun(k.egitim && k.egitim.bit)}`,
          `${gun(k.test && k.test.bas)} → ${gun(k.test && k.test.bit)}`,
          `${isaretli(k.egitimGetiri)} (${k.egitimIslem})`,
          isaretli(k.testGetiri),
          String(k.testIslem),
          k.wfe == null ? '—' : yuzdeYaz(k.wfe, 0),
          Object.entries(k.ayar || {}).map(([a, v]) => `${a}=${v}`).join(' · ') || 'varsayılan'
        ]);
        if (tr.children[4]) tr.children[4].className = yuzdeTon(k.testGetiri);
        return tr;
      }));
    }
  }

  AG.pages = AG.pages || {};
  AG.pages.backtest = { optimizasyonSonuclari, izlemeTaramasi, walkForward, tonSinifi };

  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.backtest;
})(typeof window !== 'undefined' ? window : globalThis);
