/**
 * STRATEJİLER SEKMESİ — liste ve ayrıntının "Kurallar" bölümü.
 * 62.9 (kullanıcıyla taslak): liste = Çalışan botlar (katalogda `portfoy: true` — Hücum, Denge) · Adaylar · katlı
 * "Geçti, kullanılmıyor"; elenenler (`archived`) Stratejiler'de YOK — Arşiv › Eski stratejiler (arsivCiz).
 * `grup()` (aktif/aday/arsiv) seçiciler için aynen kalır; ekran gruplaması `listeGrubu()`.
 * ═══════════════════════════════════════════════════════════════════════════
 * Eski "Strateji" ve "Araştırma" sekmeleri aynı nesneleri iki ayrı yerde
 * anlatıyordu ve ölçüm durumu kataloğun `archived` bayrağıyla çelişebiliyordu.
 * Artık tek liste:
 *   · durum   — sunucunun `/api/strategies` yanıtındaki `durum` alanı
 *               (lib/research/adaylar.js'ten: GEÇTİ / BEKLET / ÖLDÜ / ÖLÇÜLMEDİ)
 *   · grup    — arşivde ise Arşiv; değilse GEÇTİ → Aktif, diğerleri → Aday
 *   · kaynak  — adayın `kaynakTuru`; kayıt yoksa etiketten (kitap) ya da "kendi"
 *
 * Saf VERİ → DOM: sunucuya gitmez, durum tutmaz; seçim ve eylemler app.js'te.
 */
(function (global) {
  'use strict';
  const AG = global.AG || (global.AG = {});
  const el = (t, p, c) => AG.dom.el(t, p, c);

  const DURUM = {
    'GEÇTİ': { sinif: 'badge badge-success', metin: '✅ Geçti', kenar: 'durum-pos' },
    'BEKLET': { sinif: 'badge badge-warning', metin: '⏸ Beklet', kenar: 'durum-warn' },
    'ÖLDÜ': { sinif: 'badge badge-danger', metin: '❌ Elendi', kenar: 'durum-neg' },
    'ÖLÇÜLMEDİ': { sinif: 'badge', metin: '⚪ Ölçülmedi', kenar: '' }
  };
  const KAYNAK = { kitap: '📚 Kitap', internet: '🌐 Makale', kendi: '🛠 Kendi tasarım' };
  const GRUPLAR = [['aktif', 'Aktif'], ['aday', 'Aday'], ['arsiv', 'Arşiv']];

  /**
   * Katalog anahtarı ↔ araştırma kaydı. Donchian üç ayrı ölçümle kayıtlı
   * (portföy · yalnız BTC · yalnız ETH); üçü de aynı stratejinin ölçümüdür.
   */
  const ADAY_ESLEME = { donchian_portfoy: 'donchian_trend', donchian_btc: 'donchian_trend', donchian_eth: 'donchian_trend' };
  const adaylariBul = (key, adaylar) =>
    (adaylar || []).filter(a => (ADAY_ESLEME[a.anahtar] || a.anahtar) === key);

  function grup(s) {
    if (s.archived) return 'arsiv';
    return s.durum === 'GEÇTİ' ? 'aktif' : 'aday';
  }
  /** Saf (62.9): ekran grubu — bot (çalışan portföy botu) · aday · gecti (geçti, kullanılmıyor) · arsiv (elendi). */
  function listeGrubu(s) {
    if (s.archived) return 'arsiv';
    if (s.portfoy) return 'bot';
    return s.durum === 'GEÇTİ' ? 'gecti' : 'aday';
  }
  const LISTE_GRUPLARI = [['bot', 'Çalışan botlar', false], ['aday', 'Adaylar', false], ['gecti', 'Geçti, kullanılmıyor', true]];

  function kaynak(s, adaylar) {
    const a = adaylariBul(s.key, adaylar)[0];
    if (a && a.kaynakTuru) return a.kaynakTuru;
    return /kitap/i.test(s.label || '') ? 'kitap' : 'kendi';
  }

  function durumRozeti(s) {
    // Arşivde ölçüm kaydı yoksa "ölçülmedi" demek yanıltır: elendiği için arşivde.
    if (s.archived && (!s.durum || s.durum === 'ÖLÇÜLMEDİ')) return el('span', { class: 'badge', text: '🗄 Arşiv' });
    const d = DURUM[s.durum] || DURUM['ÖLÇÜLMEDİ'];
    return el('span', { class: d.sinif, text: d.metin });
  }

  const kaynakRozeti = (s, adaylar) => el('span', { class: 'badge', text: KAYNAK[kaynak(s, adaylar)] || kaynak(s, adaylar) });

  /**
   * Sol liste.
   * @param kap       liste kabı
   * @param katalog   /api/strategies `strategies`
   * @param adaylar   /api/strateji/adaylar `adaylar`
   * @param botSayisi { [key]: çalışan bot sayısı }
   * @param secili    seçili anahtar
   * @param sec       (key) => void
   */
  function listeCiz(kap, katalog, adaylar, botSayisi, secili, sec, gruplar) {
    if (!kap) return;
    const parcalar = [];
    for (const [g, ad, katli] of (gruplar || LISTE_GRUPLARI)) {
      const uyeler = (katalog || []).filter(s => listeGrubu(s) === g);
      if (!uyeler.length) continue;
      const satirlar = [];
      for (const s of uyeler) {
        const n = (botSayisi && botSayisi[s.key]) || 0;
        const d = DURUM[s.durum] || DURUM['ÖLÇÜLMEDİ'];
        satirlar.push(el('button', {
          type: 'button',
          class: `strat-satir ${s.archived ? '' : d.kenar}${s.key === secili ? ' is-active' : ''}`.trim(),
          'aria-pressed': s.key === secili ? 'true' : 'false',
          'data-strat-key': s.key,
          title: s.key,
          onclick: () => sec && sec(s.key)
        }, [
          el('span', { class: 'strat-satir-ad', text: s.label }),
          el('span', { class: 'strat-satir-alt' }, [
            durumRozeti(s),
            s.pine ? el('span', { class: 'badge tint-primary', text: 'Pine' }) : kaynakRozeti(s, adaylar),
            n ? el('span', { class: 'badge tint-cyan-soft', text: `● ${n} bot` }) : null
          ])
        ]));
      }
      // Katlı grup seçili stratejiyi içeriyorsa açık başlar (seçim görünür kalsın).
      if (katli) parcalar.push(el('details', Object.assign({ class: 'strat-grup-kat', id: `stratKat-${g}` }, uyeler.some(s => s.key === secili) ? { open: '' } : {}), [
        el('summary', { class: 'strat-grup-baslik', text: `${ad} · ${uyeler.length}` }), ...satirlar]));
      else parcalar.push(el('div', { class: 'strat-grup-baslik', text: `${ad} · ${uyeler.length}` }), ...satirlar);
    }
    AG.dom.doldur(kap, parcalar.length ? parcalar : [el('p', { class: 'tone-muted', text: 'Strateji kataloğu boş.' })]);
  }

  /** Ayrıntı başlığındaki rozetler. */
  function rozetler(kap, s, adaylar, botSayisi) {
    if (!kap || !s) return;
    const n = (botSayisi && botSayisi[s.key]) || 0;
    const grupAdi = { bot: 'Çalışan bot', aday: 'Aday', gecti: 'Geçti, kullanılmıyor', arsiv: 'Arşiv' }[listeGrubu(s)];
    AG.dom.doldur(kap, [
      el('span', { class: 'badge tint-primary', text: grupAdi }),
      durumRozeti(s),
      kaynakRozeti(s, adaylar),
      s.pine ? el('span', { class: 'badge tint-primary', text: 'Pine' }) : null,
      el('span', { class: 'mono-note', text: s.key }),
      n ? el('span', { class: 'badge tint-cyan-soft', text: `● ${n} bot çalışıyor` }) : null
    ]);
  }

  /** "Kurallar" bölümü: katalog notu + araştırma kaydının kuralları ve uyarıları. */
  function kurallarCiz(kap, s, adaylar) {
    if (!kap || !s) return;
    const kayitlar = adaylariBul(s.key, adaylar);
    const parcalar = [];
    if (s.pine) {
      // İçe aktarılan Pine (P4): kurallar betiğin kendisidir — Pine ekranında açılır.
      parcalar.push(el('div', { class: 'trace-note mb-5' }, [
        el('span', { text: 'İçe aktarılan TradingView betiği. Kurallar betiğin kendisi; motorla bilinen farklar (dolum zamanı, desteklenmeyen yapılar) Pine ekranındaki denetim raporunda. ' }),
        el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Betiği aç', onclick: () => { if (AG.rota) AG.rota.git('arastirma/pine'); if (AG.pages.pine) AG.pages.pine.ac(s.key); } })
      ]));
    } else if (s.note) parcalar.push(el('p', { class: 'hint text-base leading-relaxed mb-7', text: s.note }));
    if (s.archived) {
      parcalar.push(el('p', { class: 'text-warn mb-7', text: 'Arşivde: bot başlatılamaz; backtestte kıyas ölçütü olarak durur.' }));
    }
    for (const a of kayitlar) {
      parcalar.push(el('div', { class: 'mb-7' }, [
        kayitlar.length > 1 ? el('div', { class: 'label-strong mb-2', text: a.ad }) : null,
        el('p', { class: 'mono-note mb-5', text: `${a.piyasa} · kaynak: ${a.kaynak}` }),
        el('div', { class: 'grid-2' }, [
          el('div', null, [
            el('div', { class: 'bt-metric-label mb-2', text: 'Kurallar' }),
            el('ul', { class: 'aday-liste' }, (a.kurallar || []).map(k => el('li', { text: k })))
          ]),
          el('div', null, [
            el('div', { class: 'bt-metric-label mb-2', text: 'Dikkat' }),
            (a.uyarilar || []).length
              ? el('ul', { class: 'aday-liste aday-uyari' }, a.uyarilar.map(k => el('li', { text: k })))
              : el('p', { class: 'tone-muted', text: 'Kayıtlı uyarı yok.' }),
            a.canli ? el('p', { class: 'hint hint-sm mt-5' }, [el('strong', { text: 'Canlıya geçiş: ' }), el('span', { text: a.canli })]) : null
          ])
        ])
      ]));
    }
    if (!s.note && !kayitlar.length) parcalar.push(el('p', { class: 'tone-muted', text: 'Bu strateji için kayıtlı kural metni yok.' }));
    AG.dom.doldur(kap, parcalar);
  }

  AG.pages = AG.pages || {};
  /** 62.9: Arşiv › Eski stratejiler — elenenler (tıklayınca Stratejiler ekranında ayrıntısı açılır). */
  function arsivCiz(kap, katalog, adaylar, sec) {
    if (!kap) return;
    listeCiz(kap, katalog, adaylar, {}, null, sec, [['arsiv', 'Elenen', false]]);
  }
  AG.pages.stratejiler = { grup, listeGrubu, LISTE_GRUPLARI, kaynak, adaylariBul, listeCiz, arsivCiz, rozetler, kurallarCiz, DURUM };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.stratejiler;
})(typeof window !== 'undefined' ? window : globalThis);
