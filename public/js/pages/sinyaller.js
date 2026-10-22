/**
 * SİNYALLER EKRANI — #/sinyaller `AG.pages.sinyaller` (63.3; kullanıcıyla taslak 1–2 üzerinden)
 * ═══════════════════════════════════════════════════════════════════════════
 * "Bugün sistem ne diyor, ne zaman fikir değiştirebilir?" — yalnız okur, emir / ayar değiştirmez.
 *   · #snlKurallar — UYGULANAN kurallar tek tabloda: BTC trendi · Coin sepeti trendi (Hücum, Denge — GET /api/sinyaller,
 *     lib/research/sinyaller.js) · Nasdaq M10 · BIST M10 (gri: kâğıt model, canlıya alınmaz — Ö3) (GET /api/tasarimci/aday-havuzu)
 *     · Dengeleme bandı (%50 QQQ + %50 Hücum — GET /api/tasarimci/model/m-837 pozisyon.kollar, bant katalogdan).
 *     Sütunlar: Kural · Bugün ne diyor · Karara uzaklık (çubuk) · Sıradaki karar · Kim uyguluyor.
 *   · #snlSepet — coin coin katlı tablo (açık pencere, en yakın çıkış / giriş, oynaklık tavanı).
 *   · #snlM10 — Nasdaq M10 sıralamasının sınırı (8.–13. sıra + çıkacaklar), katlı.
 *   · #snlGolge — GÖLGE kurallar (yalnız izlenir): Bollinger'li kural · 3 günlük karar · Yatay piyasa filtresi
 *     (GET /api/ileri/bollinger). "Bugün ne derdi" ve uygulanan kurala göre farkı; ayrıntı İleri test'te.
 * Bilgi göstergeleri (funding, stablecoin, MVRV) kullanıcı kararıyla YOK. Gösterge havuzu Araştırma › Strateji testi'nde.
 * DOM yalnız AG.dom; sunucu metni metin.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  /** 72.0: görünen bot adı kimlikten (AG.botAd yoksa yedek ad). */
  const botAdi = (k, yedek) => (AG && AG.botAd && AG.botAd.ad(k)) || yedek;

  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const yuzde = (x, n = 1) => (sayiMi(x) ? `${x < 0 ? '−' : ''}%${(Math.abs(x) * 100).toLocaleString('tr-TR', { minimumFractionDigits: n, maximumFractionDigits: n })}` : '—');
  const puan = (x) => (sayiMi(x) ? `${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan` : '—');
  const dolar = (x) => (sayiMi(x) ? `${Math.round(x).toLocaleString('tr-TR')} $` : '—');
  const gunAdi = (g) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(g || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : '—'; };
  const kararAdi = (k) => (k == null ? '—' : k ? 'alımda' : 'nakitte');
  /** Çıkışa bu kadar yakınsa sarı (kural yakında fikir değiştirebilir). */
  const YAKIN = 0.03;
  /** Çubuk doluluğu: pay / tam (0–1). */
  const doluluk = (pay, tam) => (sayiMi(pay) && tam > 0 ? Math.max(0, Math.min(1, pay / tam)) : 0);

  /* ── Saf: satır modelleri (öz test) ──────────────────────────────────────── */

  /** BTC trendi (O-GC). `b` = /api/sinyaller `btc`. */
  function btcSatiri(b) {
    const s = { kimlik: 'btc', kural: 'BTC trendi', aciklama: 'kapanış 100 günlük ortalamanın altına inerse nakde geç', kim: [botAdi('hucum', 'Kairos'), botAdi('denge', 'Tao')], sonraki: 'her gün 03:00' };
    if (!b || b.hata || !b.hazir) return { ...s, ne: b && b.hata ? `okunamadı: ${b.hata}` : 'henüz hesaplanmadı', ton: 'notr', uzaklik: '', alt: '', dolu: 0 };
    if (b.icerde) {
      return { ...s, ne: 'yükselişte — BTC tut', ton: 'iyi',
        uzaklik: `ortalamanın ${yuzde(b.fiyatPay)} üstünde`, alt: `${dolar(b.kapanis)} · çıkış çizgisi ${dolar(b.sma100)}`,
        dolu: doluluk(b.fiyatPay, 0.15), yakin: b.fiyatPay < YAKIN, gun: b.gun };
    }
    const eksik = [b.fiyatPay > 0 ? null : `fiyat ortalamanın ${yuzde(-b.fiyatPay)} altında`, b.ortalamaPay > 0 ? null : `50 günlük ort. 200 günlüğün ${yuzde(-b.ortalamaPay)} altında`].filter(Boolean);
    return { ...s, ne: 'düşüşte — nakitte bekle', ton: 'uyari',
      uzaklik: eksik.length ? `girmek için: ${eksik.join(' ve ')}` : 'giriş koşulları sağlandı — sıradaki kararda girer',
      alt: `${dolar(b.kapanis)} · giriş çizgisi ${dolar(b.sma100)}`, dolu: eksik.length ? doluluk(0.15 + Math.min(b.fiyatPay, b.ortalamaPay), 0.15) : 1, gun: b.gun };
  }

  /** Coin sepeti (Donchian, 15 coin × 9 pencere). `p` = /api/sinyaller `sepet`. */
  function sepetSatiri(p) {
    const s = { kimlik: 'sepet', kural: 'Coin sepeti trendi', aciklama: `${(p && p.toplam) || 15} coin, her biri 9 ayrı Donchian penceresiyle`, kim: [botAdi('hucum', 'Kairos'), botAdi('denge', 'Tao')], sonraki: 'her gün 03:00 · liste ayın 1\'i' };
    if (!p || p.hata) return { ...s, ne: p && p.hata ? `okunamadı: ${p.hata}` : 'henüz hesaplanmadı', ton: 'notr', uzaklik: '', alt: '', dolu: 0 };
    const en = p.enYakin || [];
    return { ...s, ne: `${p.trendde} / ${p.toplam} coin trendde`, ton: p.trendde ? 'iyi' : 'uyari',
      uzaklik: en.length ? `en yakın çıkış: ${en.map(x => `${x.kisa} ${yuzde(x.pay)}`).join(', ')}` : 'açık pencere yok',
      alt: 'bir pencere kapanırsa coinin payı 1/9 azalır', dolu: en.length ? doluluk(en[0].pay, 0.15) : 0, yakin: !!(en.length && en[0].pay < YAKIN), gun: p.gun };
  }

  /** Nasdaq / BIST M10. `m` = /api/tasarimci/aday-havuzu modeller[id]. */
  function m10Satiri(m, { id, ad, kim, gri = false }) {
    const s = { kimlik: id, kural: ad, aciklama: 'son 12 ayın en güçlü 10 hissesi, eşit pay', kim: [kim], gri,
      sonraki: m && m.sonrakiKarar ? `${gunAdi(m.sonrakiKarar.karar)} kapanış → ${gunAdi(m.sonrakiKarar.uygulama)}` : '—' };
    if (!m || m.hata) return { ...s, ne: m && m.hata ? `okunamadı: ${m.hata}` : 'henüz hesaplanmadı', ton: 'notr', uzaklik: '', alt: '', dolu: 0 };
    const elde = (m.sonKarar && m.sonKarar.liste) || [];
    const sat = m.satirlar || [];
    const cik = sat.filter(x => x.durum === 'cikacak'), gir = sat.filter(x => x.durum === 'girecek');
    const on = sat.find(x => x.sira === 10), onbir = sat.find(x => x.sira === 11);
    const tahmin = m.kesinlik === 'tahmin' ? ' (tahmin)' : '';
    const uzaklik = cik.length || gir.length
      ? `sıradaki kararda${tahmin}: ${[cik.length ? `${cik.map(x => x.s).join(', ')} çıkıyor` : '', gir.length ? `${gir.map(x => x.s).join(', ')} giriyor` : ''].filter(Boolean).join(', ')}`
      : 'sıradaki kararda liste değişmiyor';
    const fark = on && onbir && sayiMi(on.p) && sayiMi(onbir.p) ? on.p - onbir.p : null;
    return { ...s, ne: elde.length ? `${elde.length} hisse tut` : 'liste yok', liste: elde.join(', '), ton: gri ? 'notr' : 'iyi',
      uzaklik, alt: fark != null ? `10. ile 11. sıra arası ${puan(fark)} (12 aylık getiri)` : '',
      dolu: cik.length || gir.length ? 0.15 : doluluk(fark, 0.3), yakin: !!(cik.length || gir.length) && !gri };
  }

  /** Dengeleme bandı (m-837). `poz` = model/m-837 pozisyon, `bant` = katalog dengeleme.bantPuan, `hedef` = 0,5. */
  function bantSatiri(poz, bant = 0.10, hedef = 0.5) {
    const s = { kimlik: 'bant', kural: 'Dengeleme bandı', aciklama: `${botAdi('hucum', 'Kairos')} payı %${Math.round((hedef - bant) * 100)}–${Math.round((hedef + bant) * 100)} dışına çıkınca 50/50'ye dön`,
      kim: [botAdi('m-837', 'Simurg')], sonraki: 'her işlem günü' };
    const k = poz && poz.kollar;
    const top = k ? (k.cekirdek || 0) + (k.uydu || 0) : 0;
    if (!top) return { ...s, ne: 'henüz pozisyon yok', ton: 'notr', uzaklik: '', alt: '', dolu: 0 };
    const pay = k.uydu / top, kalan = bant - Math.abs(pay - hedef);
    return { ...s, ne: kalan > 0 ? 'dengede' : 'bant dışında — dengelenecek', ton: kalan > 0 ? 'iyi' : 'uyari',
      uzaklik: `${botAdi('hucum', 'Kairos')} payı ${yuzde(pay)} · banda ${puan(Math.max(0, kalan))}`, alt: poz.gun ? `model ${gunAdi(poz.gun)}` : '',
      dolu: doluluk(kalan, bant), yakin: kalan < 0.03 };
  }

  /** Gölge kurallar. `v` = /api/ileri/bollinger. */
  function golgeSatirlari(v) {
    const r = v && v.rapor, b = r && r.btc && r.btc.sonKarar, z = v && v.zamanDilimi, d = v && v.rangeVeto;
    const satir = (kural, golge, taban, hukum, ek) => ({ kural, ne: golge == null ? '—' : kararAdi(golge) + (ek || ''),
      fark: golge == null || taban == null ? '—' : golge === taban ? 'aynı' : `farklı — uygulanan kural ${kararAdi(taban)}`, farkli: golge != null && taban != null && golge !== taban, hukum: gunAdi(hukum) });
    return [
      satir('Bollinger’li kural', b ? b.C1 : null, b ? b.C0 : null, r && r.sonrakiHukumTarihi),
      satir('3 günlük karar', z && z.A ? z.A.sonKarar : null, z ? z.tabanSonKarar : null, z && z.hukumTarihi),
      satir('Yatay piyasa filtresi', d ? d.sonKarar : null, d ? d.tabanSonKarar : null, d && d.hukumTarihi, d && d.bugunVeto ? ' (bugün yeni giriş engelli)' : '')
    ];
  }

  /** Coin tablosu satırları: en yakın çıkıştan uzağa, pencere açık olmayanlar sonda. */
  function coinSirala(coinler) {
    return [...(coinler || [])].sort((a, b) => (a.enYakinCikis ? a.enYakinCikis.pay : Infinity) - (b.enYakinCikis ? b.enYakinCikis.pay : Infinity));
  }

  /* ── Çizim ───────────────────────────────────────────────────────────────── */

  function cubuk(dolu, ton) {
    const { svg } = AG.dom;
    return svg('svg', { class: `snl-cubuk snl-cubuk-${ton}`, viewBox: '0 0 100 6', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [
      svg('rect', { class: 'snl-cubuk-zemin', x: 0, y: 0, width: 100, height: 6, rx: 3 }),
      svg('rect', { class: 'snl-cubuk-dolu', x: 0, y: 0, width: Math.round(dolu * 100), height: 6, rx: 3 })
    ]);
  }

  function kuralSatiri(x) {
    const { el } = AG.dom;
    return el('tr', { class: x.gri ? 'snl-gri' : null, 'data-kural': x.kimlik }, [
      el('td', { class: 'pf-sola' }, [el('strong', { text: x.kural }), x.gri ? el('span', { class: 'badge snl-kagit', text: 'kâğıt model' }) : null, el('div', { class: 'hint hint-sm mb-0', text: x.aciklama })]),
      el('td', { class: 'pf-sola' }, [el('span', { class: `badge${x.ton === 'iyi' ? ' badge-success' : x.ton === 'uyari' ? ' badge-warning' : ''}`, text: x.ne }),
        x.liste ? el('div', { class: 'hint hint-sm mb-0', text: x.liste }) : null]),
      el('td', { class: 'pf-sola snl-uzaklik' }, [el('span', { class: x.yakin ? 'tone-warning' : '', text: x.uzaklik }), x.uzaklik ? cubuk(x.dolu, x.yakin ? 'uyari' : x.gri ? 'notr' : 'iyi') : null,
        x.alt ? el('div', { class: 'hint hint-sm mb-0', text: x.alt }) : null]),
      el('td', { class: 'pf-sola', text: x.sonraki }),
      el('td', { class: 'pf-sola' }, x.kim.map(k => el('span', { class: 'veri-kullanan', text: k })))
    ]);
  }

  function ciz({ si, havuz, m837, katalog, ileri }) {
    const kok = bul('snlKurallar');
    if (!kok || !AG.dom) return;
    const { el, doldur } = AG.dom;
    const hm = (havuz && havuz.modeller) || {};
    const kd = ((katalog && katalog.modeller) || []).find(m => m.id === 'm-837');
    const bant = kd && kd.dengeleme && sayiMi(kd.dengeleme.bantPuan) ? kd.dengeleme.bantPuan : 0.10;
    const satirlar = [
      btcSatiri(si && si.btc), sepetSatiri(si && si.sepet),
      m10Satiri(hm['m-qqq-m10'], { id: 'm10', ad: 'Nasdaq momentum (M10)', kim: botAdi('m-qqq-m10', 'Nova') }),
      bantSatiri(m837 && m837.pozisyon, bant, kd && kd.dengeleme && sayiMi(kd.dengeleme.hedef) ? kd.dengeleme.hedef : 0.5),
      m10Satiri(hm['m-bist-m10'], { id: 'bist', ad: 'BIST momentum (M10)', kim: botAdi('m-bist-m10', 'Lydia'), gri: true })
    ];
    const gun = si && si.btc && si.btc.gun;
    doldur(kok, [
      el('p', { class: 'hint hint-sm mb-2', text: `Kripto kuralları ${gun ? gunAdi(gun) : '—'} kapanışıyla, botların kendi kural koduyla Binance günlük verisinden. "Karara uzaklık" çubuğu kısaldıkça kural fikir değiştirmeye yaklaşır.` }),
      AG.tablo.kutulu({ sinif: 'pf-tablo snl-tablo', basliklar: ['Kural', 'Bugün ne diyor', 'Karara uzaklık', 'Sıradaki karar', 'Kim uyguluyor'], satirlar: satirlar.map(kuralSatiri) })
    ]);

    const sp = bul('snlSepetIc'), sepet = si && si.sepet;
    if (sp) {
      doldur(sp, sepet && sepet.coinler ? [
        AG.tablo.kutulu({ sinif: 'pf-tablo', basliklar: ['Coin', 'Açık pencere', 'En yakın çıkış', 'En yakın giriş', 'Not'],
          satirlar: coinSirala(sepet.coinler).map(c => el('tr', null, [
            el('td', { class: 'pf-sola' }, [el('strong', { text: c.kisa })]),
            el('td', { text: `${c.acik} / ${c.toplam}` }),
            el('td', { class: c.enYakinCikis && c.enYakinCikis.pay < YAKIN ? 'tone-warning' : '', text: c.enYakinCikis ? `${yuzde(c.enYakinCikis.pay)} (${c.enYakinCikis.N} gün)` : '—' }),
            el('td', { text: c.enYakinGiris ? `${yuzde(c.enYakinGiris.pay)} (${c.enYakinGiris.N} gün)` : '—' }),
            el('td', { class: 'pf-sola hint hint-sm', text: [c.acik ? '' : 'trend dışında, giriş bekliyor', c.girisYasak ? `oynaklık yüksek (yıllık ${yuzde(c.vol, 0)}) — yeni pencere açılmaz` : ''].filter(Boolean).join(' · ') })
          ])) }),
        el('p', { class: 'hint hint-sm mt-2 mb-0', text: `${sepet.ay} listesi (30 günlük ortalama işlem hacmine göre ilk 15). En yakın çıkış: kapanışın en yakın pencere stopuna uzaklığı; en yakın giriş: kapalı pencerenin kırılım seviyesine uzaklığı (eksi = altında). Yıllık oynaklık %${Math.round((sepet.volTavani || 1.3) * 100)} üstündeyse yeni pencere açılmaz.` })
      ] : [el('p', { class: 'hint mb-0', text: sepet && sepet.hata ? `Okunamadı: ${sepet.hata}` : 'Henüz hesaplanmadı.' })]);
    }

    const mk = bul('snlM10Ic'), m = hm['m-qqq-m10'];
    if (mk) {
      const sat = (m && m.satirlar) || [];
      const goster = sat.filter(x => (x.sira != null && x.sira >= 8 && x.sira <= 13) || x.durum === 'cikacak' || x.durum === 'girecek');
      doldur(mk, goster.length ? [
        AG.tablo.kutulu({ sinif: 'pf-tablo', basliklar: ['Sıra', 'Hisse', '12 aylık getiri', 'Durum'],
          satirlar: goster.map(x => el('tr', null, [el('td', { text: x.sira != null ? `${x.sira}.` : '—' }), el('td', { class: 'pf-sola' }, [el('strong', { text: x.s })]),
            el('td', { text: sayiMi(x.p) ? yuzde(x.p) : '—' }),
            el('td', { class: `pf-sola ${x.durum === 'cikacak' || x.durum === 'girecek' ? 'tone-warning' : ''}`, text: { kaliyor: 'elde, kalıyor', cikacak: 'elde, çıkacak', girecek: 'girecek', yedek: 'yedek' }[x.durum] || x.durum })])) }),
        el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Sıralama geçmiş ay sonu kapanışlarıyla yapılır; karar gününe kadar yalnız endeks üyeliği ya da eksik veri değiştirebilir. Ayrıntı: Portföy › Model portföyler.' })
      ] : [el('p', { class: 'hint mb-0', text: 'Sıralama henüz yok.' })]);
    }

    const gk = bul('snlGolge');
    if (gk) {
      const g = golgeSatirlari(ileri);
      doldur(gk, [
        AG.tablo.kutulu({ sinif: 'pf-tablo', basliklar: ['Kural', 'Bugün ne derdi', 'Uygulanana göre', 'Karar günü'],
          satirlar: g.map(x => el('tr', null, [el('td', { class: 'pf-sola' }, [el('strong', { text: x.kural })]), el('td', { class: 'pf-sola', text: x.ne }),
            el('td', { class: `pf-sola ${x.farkli ? 'tone-warning' : 'tone-muted'}`, text: x.fark }), el('td', { text: x.hukum })])) }),
        el('p', { class: 'hint hint-sm mt-2 mb-0' }, [el('span', { text: 'Bu kurallar uygulanmıyor, yalnız izleniyor; ara raporda hüküm verilmez. Ayrıntı ve grafikler: ' }), el('a', { href: '#/ileri', text: 'İleri test' }), el('span', { text: '.' })])
      ]);
    }
  }

  async function yukle() {
    if (!bul('snlKurallar') || !AG.api) return;
    const al = (f) => Promise.resolve().then(f).then(r => (r && r.success !== false ? r : null)).catch(() => null);
    const T = AG.api.tasarimci || {};
    const [si, havuz, m837, katalog, ileri] = await Promise.all([
      al(() => AG.api.sinyaller()), al(() => T.adayHavuzu()), al(() => T.model('m-837')), al(() => T.katalog()), al(() => AG.api.ileriBollinger())
    ]);
    ciz({ si, havuz, m837, katalog, ileri });
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-sinyaller') yukle(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.sinyaller = { yukle, btcSatiri, sepetSatiri, m10Satiri, bantSatiri, golgeSatirlari, coinSirala };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.sinyaller;
})(typeof window !== 'undefined' ? window : globalThis);
