/**
 * STRATEJİ ADAYLARI — ölçülmüş her adayın künyesi (panel: Araştırma sekmesi).
 *
 * Kaynak: PLAN-GECE.md F6. Buradaki sayılar o gecenin KAYITLI ölçümüdür;
 * `olcum` alanı olan adaylar panelden yeniden ölçülebilir ve canlı sonuç
 * bu kayıttan farklı çıkarsa (veri güncellendi) panel ikisini birlikte
 * gösterir. Kill kriteri her adayda ölçümden ÖNCE yazıldı — yeni aday
 * eklerken de öyle olmalı.
 *
 * durum: 'GEÇTİ' | 'BEKLET' | 'ÖLDÜ'
 */
const ADAYLAR = Object.freeze([
  {
    anahtar: 'donchian_portfoy',
    ad: 'Donchian trend topluluğu — 15 varlık portföyü',
    durum: 'GEÇTİ',
    ozet: 'Beş kill kriterinin beşi de geçti. Düşüşü al-tut\'un yarısında tutuyor; son 15 ay düz.',
    piyasa: 'Binance USDⓈ-M perp · günlük kapanış · yalnız long',
    kaynakTuru: 'internet',
    kaynak: 'İNTERNET — Zarattini, Pagani & Barbon (2025) makalesi (kurallar ikincil özetten: CXO Advisory); çok varlıklı türev, kaynaktan birebir değil',
    kurallar: [
      '9 alt model, N ∈ {5, 10, 20, 30, 60, 90, 150, 250, 360} gün',
      'Giriş: kapanış > önceki N günün en yüksek kapanışı',
      'İzleyen stop: (N günün en yüksek + en düşük kapanışı) / 2, yalnız yukarı; kapanış altına inerse çık',
      'Varlık maruziyeti = açık alt model / 9 × (%25 yıllık vol hedefi / 30 günlük vol), en çok 2x',
      'Portföy: hazır varlıklara eşit ağırlık, toplam brüt maruziyet en çok 2x',
      'Karar günlük kapanışta, emir ertesi gün açılışta; maruziyet değişimi < 0,10 ise işlem yok'
    ],
    kayit: { donem: '2020-09 → 2026-08', sharpe: 1.25, cagr: 0.143, maxDD: 0.157, alTutSharpe: 0.92, alTutMaxDD: 0.346, oosSharpe: -0.11, oosCagr: -0.009, islem: 3918 },
    uyarilar: [
      'Hayatta kalma yanlılığı ÖLÇÜLDÜ (2026-10-07, PLAN-HAYATTA-KALMA.md): nokta-zamanlı evrende (listeden çıkanlar dahil, 157 coin) Sharpe 1,29 → 1,11, MaxDD %15,7 → %20,3 — yine GEÇTİ. Canlı beklentisi PIT sayılarıyla kurulmalı.',
      'Yayın sonrası dilim (2025-06 →) düz: Sharpe −0,11. Kazancın tamamı yayın öncesinde.',
      'Başlangıç kayınca Sharpe 0,6–0,9; 1,25\'in bir kısmı 2020 sonu boğasından.',
      'Asgari sermaye ≈ 2.000–4.000 USDT; altında bacaklar Binance asgari emir tutarına takılır.'
    ],
    canli: 'Borsa sekmesi → Donchian trend botu (portföy modu). Önce testnet\'te 2–4 hafta.',
    olcum: { tur: 'donchian', semboller: null }
  },
  {
    anahtar: 'donchian_btc',
    ad: 'Donchian trend topluluğu — yalnız BTC',
    durum: 'BEKLET',
    ozet: 'Sharpe ve düşüş kriterleri geçti, ama net kârın %54\'ü tek yıldan (2024).',
    piyasa: 'Binance USDⓈ-M perp · günlük kapanış · yalnız long',
    kaynakTuru: 'internet',
    kaynak: 'İNTERNET — Zarattini, Pagani & Barbon (2025) makalesi',
    kurallar: ['Portföy adayıyla aynı kurallar, tek varlıkta (BTC).'],
    kayit: { donem: '2020-09 → 2026-08', sharpe: 0.82, cagr: 0.122, maxDD: 0.245, alTutSharpe: 0.68, alTutMaxDD: 0.469, oosSharpe: -0.10, oosCagr: -0.02, islem: 301 },
    uyarilar: ['Ortalama maruziyet 0,23x — vol hedefi BTC\'de çoğu zaman 0,4x\'in altında kalıyor.'],
    canli: 'Tek başına önerilmez; portföy adayının bir bacağı olarak çalışır.',
    olcum: { tur: 'donchian', semboller: ['BTC/USDT'] }
  },
  {
    anahtar: 'donchian_eth',
    ad: 'Donchian trend topluluğu — yalnız ETH',
    durum: 'ÖLDÜ',
    ozet: 'Net Sharpe 0,64 < 0,80 (1. kriter).',
    piyasa: 'Binance USDⓈ-M perp · günlük kapanış · yalnız long',
    kaynakTuru: 'internet',
    kaynak: 'İNTERNET — Zarattini, Pagani & Barbon (2025) makalesi',
    kurallar: ['Portföy adayıyla aynı kurallar, tek varlıkta (ETH).'],
    kayit: { donem: '2020-09 → 2026-08', sharpe: 0.64, maxDD: 0.166, alTutSharpe: 0.47 },
    uyarilar: [],
    canli: null,
    olcum: { tur: 'donchian', semboller: ['ETH/USDT'] }
  },
  {
    anahtar: 'grid_dca',
    ad: 'Grid + DCA (grid_dca)',
    durum: 'ÖLDÜ',
    ozet: 'Komisyon ve funding sıfırken bile brüt kâr yok: deal başına −%0,14. Zarar short bacakta.',
    piyasa: 'Binance USDⓈ-M perp · 4 saat · iki yön',
    kaynakTuru: 'kendi',
    kaynak: 'Bu deponun kendi tasarımı (PLAN-GRID-DCA.md)',
    kurallar: ['Çapaya asılı kafes + DCA merdiveni; ayrıntı PLAN-GRID-DCA.md.'],
    kayit: { donem: '15 varlık, 4 saat', dealBrut: -0.0014, dealNet: -0.0013, longBrut: 0.0023, shortBrut: -0.0061 },
    uyarilar: ['Long bacak tek başına brüt +%0,23/deal — long-only grid ayrı bir hipotez, ölçülmedi.'],
    canli: null,
    olcum: null
  },
  {
    anahtar: 'dca_bot',
    ad: 'DCA botu (3commas tarzı) — varsayılan ayarlar',
    durum: 'GEÇTİ',
    ozet: '4s 15 coin: Sharpe 0,80, düşüş %9,9. Günlük nokta-zamanlı evrende (listeden çıkanlar dahil) Sharpe 1,15, düşüş %2,8 — ama getiri küçük (%4/yıl).',
    piyasa: 'Binance USDⓈ-M perp · 4s ve 1g · yalnız long',
    kaynakTuru: 'internet',
    kaynak: 'İNTERNET — "Backtesting 3commas DCA Bot v2" (rouxam, MPL 2.0) uyarlaması',
    kurallar: ['1 baz + N güvenlik emri masaya konur, doldukça ortalama alınır', 'Çıkış TP / trailing TP / SL (varsayılan ayarlar)'],
    kayit: { donem: '2020-09 → 2026-10', sharpe: 0.80, maxDD: 0.099, islem: 2002, pozitif: '11/15' },
    uyarilar: ['Düşüşte ortalama alan yapı: kuyruk riski stop ve küçük boyutla sınırlı; boyut büyütülürse ölçüm geçersiz.', 'Parametreler optimize edilmedi — varsayılan ayarla ölçüldü.'],
    canli: 'Canlı İzleme → bot başlat (kâğıt). Borsa botu yok.',
    olcum: null
  },
  {
    anahtar: 'dca_seviye',
    ad: 'DCA + POC/VWAP destek teyidi',
    durum: 'BEKLET',
    ozet: 'Kullanıcı fikri: POC/VWAP tek başına zayıf, DCA girişine teyit olarak. Puan 57 → 66; holdout Sharpe 0,58 → 0,64 (küçük ama iki dönemde aynı yönde); işlem 8 kat az, getiri boyut ölçeklenmeden küçük.',
    piyasa: 'Binance USDⓈ-M perp · 4s · yalnız long',
    kaynakTuru: 'kendi',
    kaynak: 'KENDİ — kullanıcı önerisi (VPFR/VWAP seviyeleri) + dca_bot; PLAN-SEVIYE-KOMBO.md',
    kurallar: ['dca_bot varsayılan kuralları aynen', 'YENİ deal yalnız: bar önceki günün POC ya da VWAP’ına değdi VE kapanış o seviyenin üstünde'],
    kayit: { donem: '2020-09 → 2026-10', sharpe: 0.76, maxDD: 0.012, islem: 251 },
    uyarilar: ['DD iyileşmesinin çoğu daha az işlemden; asıl katkı Sharpe’ta ve küçük (+0,06 holdout).', 'Ölçekli boyutla nokta-zamanlı evrende ölçülmedi — BEKLET.'],
    canli: 'Backtest ve kâğıt botta seçilebilir; canlı borsa botu yok.',
    olcum: null
  },
  // ── KİTAPLARDAN (PLAN-KITAP-STRATEJI.md) ────────────────────────────────
  {
    anahtar: 'clenow_karsi_trend',
    ad: 'Clenow karşı trend — trend içinde dipten alım',
    durum: 'GEÇTİ',
    ozet: 'Kitap kuralı aynen; 13/15 varlık pozitif, düşüş %13. Ama Donchian\'la 0,65 korelasyonlu — aynı dönemlerde kazanıyor.',
    piyasa: 'Binance USDⓈ-M perp · günlük · yalnız long · stopsuz',
    kaynakTuru: 'kitap',
    kaynak: 'KİTAP — Andreas Clenow, Trading Evolved (Python ile Trading), Bölüm 17',
    kurallar: [
      'Filtre: EMA(40) > EMA(80)',
      'Giriş: (kapanış − son 20 günün en yüksek kapanışı) / std40(Δkapanış) < −3',
      'Çıkış: EMA40 < EMA80 ya da 20 gün dolunca',
      'Stop ve kâr hedefi yok (kitap)',
      'Boyut: adet = portföy × 0,0015 / std40(Δkapanış) — vol-parite'
    ],
    kayit: { donem: '2020-09 → 2026-10', sharpe: 1.09, cagr: 0.122, maxDD: 0.132, islem: 553, pozitif: '13/15', korelasyon: 0.65 },
    uyarilar: [
      'Stopsuz: kitabın kendi en kötü ayı −%26 (Mayıs 2010). Gevşek stop varyantı ölçülmedi.',
      'Donchian portföyüyle günlük getiri korelasyonu 0,65 — ikinci strateji olarak çeşitlendirmesi sınırlı.',
      'Hayatta kalma yanlılığı: varlık listesi bugünden.'
    ],
    canli: 'Backtest sekmesinde "Clenow Karşı Trend" olarak seçilebilir; canlı bot bağlantısı yok.',
    olcum: { tur: 'kitap', strateji: 'clenow_karsi_trend' }
  },
  {
    anahtar: 'connors_rsi_guc',
    ad: 'Connors RSI Power Zones — kısa vadeli dipten dönüş',
    durum: 'GEÇTİ',
    ozet: 'Kıl payı geçti (Sharpe 0,50). Donchian\'la korelasyonu 0,31 — ikinci strateji için asıl aday.',
    piyasa: 'Binance USDⓈ-M perp · günlük · yalnız long · stopsuz',
    kaynakTuru: 'kitap',
    kaynak: 'KİTAP — Larry Connors, Buy the Fear, Sell the Greed (Korkuyu Al), Bölüm 2',
    kurallar: [
      'Filtre: kapanış > SMA(200)',
      '1. birim: RSI(4) < 30 kapanışta al',
      '2. birim: pozisyon açıkken RSI(4) < 25',
      'Çıkış: RSI(4) > 55 kapanışta sat',
      'Stop yok (kitap). Birim boyutu kitapta yok — bizim: nakdin %47,5\'i + kalanın %95\'i'
    ],
    kayit: { donem: '2020-09 → 2026-10', sharpe: 0.50, cagr: 0.092, maxDD: 0.295, islem: 596, pozitif: '13/15', korelasyon: 0.31 },
    uyarilar: [
      'Sharpe tam eşikte (0,5019): küçük bir maliyet değişikliği sonucu çevirir.',
      'Tek varlıkta düşüş %47\'ye çıkabiliyor (SOL) — stopsuz ortalamaya dönüş.',
      'Kitap ölçümü SPY, maliyetsiz; kriptoda kanıt bu ölçümden ibaret.'
    ],
    canli: 'Backtest sekmesinde seçilebilir. Donchian + Connors birleşik portföy ölçümü açık iş.',
    olcum: { tur: 'kitap', strateji: 'connors_rsi_guc' }
  },
  {
    anahtar: 'clenow_zaman_getirisi',
    ad: 'Clenow zaman getirisi (TSMOM)',
    durum: 'ÖLDÜ',
    ozet: 'Düşüş %49,9 (sınır %35) ve 15 varlığın yalnız 7\'si pozitif; kârın %77\'si 2021\'den.',
    piyasa: 'Binance USDⓈ-M perp · günlük · long + short',
    kaynakTuru: 'kitap',
    kaynak: 'KİTAP — Clenow, Trading Evolved, Bölüm 16',
    kurallar: ['Ay başında kapanış 250 ve 125 gün öncesinden yüksekse long, ikisinden de düşükse short, değilse yok', 'Stop yok · vol-parite (std 60g)'],
    kayit: { donem: '2020-09 → 2026-10', sharpe: 0.54, maxDD: 0.499, islem: 170, pozitif: '7/15', korelasyon: 0.56 },
    uyarilar: [],
    canli: null,
    olcum: { tur: 'kitap', strateji: 'clenow_zaman_getirisi' }
  },
  {
    anahtar: 'connors_crash',
    ad: 'Connors CRASH — aşırı yükselişe short',
    durum: 'ÖLDÜ',
    ozet: 'Sharpe −0,91; altcoin yükselişlerini short\'lamak 2021\'de patladı (DOGE −%43, AVAX −%41).',
    piyasa: 'Binance USDⓈ-M perp · günlük · yalnız short',
    kaynakTuru: 'kitap',
    kaynak: 'KİTAP — Connors, Buy the Fear, Sell the Greed, Bölüm 3',
    kurallar: ['HV100 ≥ %100 ve ConnorsRSI ≥ 90 → ertesi gün %3 üstüne limit short', 'Çıkış ConnorsRSI < 30 · stop yok · boyut bizim (%20)'],
    kayit: { donem: '2020-09 → 2026-10', sharpe: -0.91, maxDD: 0.101, islem: 90, pozitif: '5/15', korelasyon: -0.22 },
    uyarilar: [],
    canli: null,
    olcum: { tur: 'kitap', strateji: 'connors_crash' }
  },
  // ── HÜCUM / DENGE (PLAN-ALTUT-YENMEK.md 8.–10b.) — kayıt botun TAMAMI (kol ×3 dahil) ──
  {
    anahtar: 'hucum',
    ad: 'Kairos — trendde %100 BTC teminat + Kalkan kolu ×3',
    durum: 'GEÇTİ',
    ozet: 'Getiri öncelikli. BTC al-tut\'u yenme kriterlerinin hepsi geçti (P 0,90); tasfiye 0. Gün içi kötümser en kötü gün −%30,6 — kullanıcının −%35 teorik sınırıyla kabul edildi (10. aşama yol 1); ön-kayıtlı −%20 güvenlik kriterini GEÇMEZ.',
    piyasa: 'Binance USDⓈ-M çoklu varlık hesabı · BTC günlük · yalnız long',
    kaynakTuru: 'kendi',
    kaynak: 'KENDİ — PLAN-ALTUT-YENMEK.md 8. aşama (O-GC), PLAN-BINDIRME-MARJ.md',
    kurallar: ['LONG AÇ: BTC kapanış > SMA100 VE SMA50 > SMA200 (pozisyon yokken) → özsermayenin %100\'ü BTC (vadeli teminat)', 'LONG KAPAT: kapanış < SMA100 → BTC satılır (USDT)', 'Her zaman Kalkan kolu (Donchian PIT + DCA PIT, ters-vol 60 g) ×3 vadelide', 'Backtest grafiği yalnız BTC ayağını çizer; botun tamamı sonuç ekranında ayrı kutuda'],
    kayit: { donem: '2020-09 → 2026-10', sharpe: 1.41, cagr: 0.748, maxDD: 0.356, alTutMaxDD: 0.767 },
    uyarilar: ['Gün içi kötümser en kötü gün −%30,6 (2025-10-10).', 'Standart backtest koşusu yalnız BTC ayağıdır (CAGR ~%36, MaxDD ~%44).'],
    canli: 'Canlı İzleme → Portföy botları (kâğıt).',
    olcum: null
  },
  {
    anahtar: 'denge',
    ad: 'Tao — trendde %50 BTC + Kalkan kolu ×3',
    durum: 'BEKLET',
    ozet: 'Gün içi risk daha düşük (−%22,8) ama ön-kayıtlı −%20 güvenlik kriterini yine geçmiyor; BTC yenme olasılığı P 0,70 (çıta sınırında). Risk menüsü seçeneği.',
    piyasa: 'Binance USDⓈ-M çoklu varlık hesabı · BTC günlük · yalnız long',
    kaynakTuru: 'kendi',
    kaynak: 'KENDİ — PLAN-ALTUT-YENMEK.md 9.–10b. aşama (p = 0,5)',
    kurallar: ['Kairos ile aynı rejim kuralı; LONG açıkken özsermayenin %50\'si BTC', 'Her zaman Kalkan kolu ×3'],
    kayit: { donem: '2020-09 → 2026-10', sharpe: 1.54, cagr: 0.556, maxDD: 0.262, alTutMaxDD: 0.767 },
    uyarilar: ['Gün içi kötümser en kötü gün −%22,8 (2025-10-10).'],
    canli: 'Canlı İzleme → Portföy botları (kâğıt).',
    olcum: null
  }
]);

module.exports = { ADAYLAR };
