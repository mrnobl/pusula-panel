/**
 * PORTFÖY TASARIMCISI — STRATEJİ KATALOĞU (C1, F3). PLAN-PORTFOY-TASARIMCI.md (c) C1.
 * ═══════════════════════════════════════════════════════════════════════════
 * STATİK KÜNYE: her kayıt bir ölçülmüş strateji ya da kıyas yapı taşıdır. Rakamlar ÖLÇÜLMEZ, PLAN-*.md "SONUÇ"
 * bölümlerinden BİREBİR kopyalanır (yüzde puan; P = eşli durağan bootstrap P(aday > kıyas)). Kaynak satırı `kaynak`
 * alanında; `scripts/panel-tasarimci-testi.js` her rakamı sabit tabloyla VE PLAN dosyasındaki satırla doğrular
 * (bir PLAN düzeltilirse ya da burada bir rakam kayarsa test kırılır).
 *
 * Alanlar:
 *   id, ad, aciklama (sade dil), plan (PLAN-*.md), deneme (no), tur: 'strateji' | 'kiyas'
 *   kabul: 'h1' (KABUL — ölçüt sonuçlardan SONRA kondu, H1) | 'kabul' (ön kayıtlı ölçütle KABUL) | 'kirilgan' (KABUL ama kırılgan)
 *          | 'kullanici' (KABUL — eşik kullanıcı kararı) | 'red' | 'olcum' (bileşen / yalnız bilgi — kabul ölçümü yok) | 'kiyas'
 *   kunye: { gel, hol, tum, maxDD, p, donem } — gel/hol CAGR (geliştirme / holdout), tum tüm dönem CAGR; yoksa null
 *   kiyas: { ad, gel?, hol?, tum?, maxDD? } — aynı dönemin kıyası (PLAN'daki satır)
 *   kirilganlik: [metin] · rozetler: ['elle' | 'otomatik-demo' | 'uygulanamaz'] · hesap · dengeleme
 *   model: tasarımcının izlediği model portföy kimliği (t1-s2.json) | null · yalnizKatalog: true (izlenmez)
 *   labKimlik: Laboratuvar (lib/portfoy) katalog kimliği — risk özeti (motor.simule) için; vekil varsa `labNot`
 *   kaynak: { dosya, satir } — PLAN dosyasında birebir geçen satır parçası (test arar) · kaynakKayit: koddan türetilen künyenin kaynağı
 *           (Hücum/Denge: lib/research/bindirme.js STRATEJILER.kayit — test ×100 ile karşılaştırır)
 *
 * ŞABLONLAR (C2): kabul edilmiş birleşimler. Kurucuda bir şablonun kolları ve ağırlıkları (± 0,5 puan) ve dengeleme kuralı
 * aynen korunursa "kabul edilmiş şablon" etiketi; dışına çıkan HER birleşim "ölçülmemiş birleşim — simülasyon, kabul değil"
 * etiketini alır (`etiketle`). 837 şablonu izlenen modelle AYNI kural: sürüm 2 bant ±10 puan, her işlem günü denetim
 * ('bant-gunluk-10'; t1-s2.json, deneme 851 — denetim B-01). Aylık 837 = sürüm 1'in eski kuralı → ölçülmemiş.
 * DENGELEME anahtarları (kurucu): 'aylik' | 'ceyrek' | 'yillik' | 'yok' | 'bant-gunluk-10' → DENGELEME_TANIM (Laboratuvar motoru).
 *
 * Saf modül: dosya okumaz, ağa çıkmaz. Dışa: liste() · kayit(id) · SABLONLAR · KOLLAR · etiketle(kollar, dengeleme)
 */
'use strict';

const QQQ_PLAN = 'PLAN-QQQ-YENMEK.md', BIST_PLAN = 'PLAN-BIST-YENMEK.md', ALTUT_PLAN = 'PLAN-ALTUT-YENMEK.md', PS_PLAN = 'PLAN-PORTFOY-STRATEJI.md';
const H1_UYARI = 'Kabul ölçütü (H1: MaxDD kıyasın en fazla 5 puan altına inebilir) sonuçlar GÖRÜLDÜKTEN sonra kondu — seçim yanlılığı taşır.';
// Kripto botlarının künyesi TradFi sızıntısı düzeltmesinden SONRAKİ kanonik kayıttan TÜRETİLİR (PLAN-TRADFI-SIZINTI.md):
// lib/research/bindirme.js STRATEJILER.kayit + AL_TUT_KAYIT + KAYIT_DONEM. Kayıt değişirse katalog ve test birlikte değişir.
const BN = require('../research/bindirme');
const bk = (id) => BN.STRATEJILER[id].kayit;
const yuz = (x) => Math.round(x * 1000) / 10;
const BOT_DONEM = `tüm dönem 2020-09-04 → 2026-10-05 (bindirme.js KAYIT_DONEM)`;
const BOT_KAYNAK = 'bindirme.js STRATEJILER.kayit (TradFi sonrası, PLAN-TRADFI-SIZINTI.md)';
const BTC_KIYAS = { ad: 'BTC al-tut (aynı dönem)', tum: yuz(BN.AL_TUT_KAYIT.cagr), hol: yuz(BN.AL_TUT_KAYIT.holdout), maxDD: yuz(BN.AL_TUT_KAYIT.maxDD) };
const QQQ_KIYAS = { ad: 'QQQ al-tut', gel: 10.6, hol: 20.3, maxDD: 53.4 };
const XU_KIYAS = { ad: 'XU030 al-tut (USD)', gel: -4.1, hol: 6.1, maxDD: 78.2 };

const KAYITLAR = [
  // ── Model portföylerin kaynağı (t1-s2.json) ─────────────────────────────────
  { id: 'qqq-m10', ad: 'Nasdaq Momentum 10', tur: 'strateji', plan: QQQ_PLAN, deneme: 830, kabul: 'h1',
    aciklama: 'Her ay sonu Nasdaq-100 üyeleri içinde son 12 ayda (son ay hariç) en çok yükselen 10 hisse, eşit ağırlık; ertesi işlem günü açılışında değiştirilir.',
    kunye: { gel: 15.4, hol: 25.4, tum: null, maxDD: 54.1, p: 0.91, donem: 'geliştirme 2005–2015 · holdout 2016 →' }, kiyas: QQQ_KIYAS,
    kirilganlik: [H1_UYARI, 'Ön kayıt ölçütüyle RED idi: MaxDD QQQ\'dan 0,7 puan derin.', 'Hayatta kalma yanlılığı: verisi olmayan eski üyeler (b gel 2,8 / hol 2,0 puan) — şart geçildi ama evren iyimser.',
      'Sektör yoğunlaşması: 2026-09-30 listesi 10/10 yarı iletken / bellek; momentum çöküşü riski.', 'Aylık devir: her satış vergi olayı.'],
    rozetler: ['elle'], hesap: 'ABD aracı kurum (Midas)', dengeleme: 'aylık — ay son NYSE işlem günü kapanışı karar, ertesi açılış', model: 'm-qqq-m10', labKimlik: 'strateji:qqq-m10',
    kaynak: { dosya: QQQ_PLAN, satir: '| 830 | M10 | %15,4 | %25,4 | %54,1 | 0,91 |' } },
  { id: 'm-837', ad: '%50 QQQ + %50 Hücum', tur: 'strateji', plan: QQQ_PLAN, deneme: 837, kabul: 'h1',
    aciklama: 'Yarısı QQQ (aracı kurum), yarısı Hücum botu (Binance); iki ayrı hesap. Hücum payı %40–%60 bandının dışına çıkınca (QQQ işlem günü kapanışında denetim) tam 50/50\'ye dengelenir — sürüm 2, deneme 851.',
    kunye: { gel: 44.7, hol: 36.1, tum: null, maxDD: 36.5, p: 0.97, donem: 'geliştirme 2018–2023 · holdout 2024 →' }, kiyas: { ad: 'QQQ al-tut (aynı dönem)', gel: 18.3, hol: 24.9, maxDD: 35.1 },
    kirilganlik: [H1_UYARI, 'Ön kayıt ölçütüyle RED idi: MaxDD QQQ\'dan 1,4 puan derin.', 'Hücum ayağı simülasyon / demo bot; gerçek parayla Hücum yok.',
      'Hesaplar arası transfer yalnız bant aşılınca (2018–2026 ölçümünde 13 kez; aylıkta 105) — kur, Türkiye kripto vergi/hukuk belirsizliği.',
      'Künye ölçülmüş aylık kuraldan (837); model sürüm 2\'den beri bant ±10 puan (851 D2: tüm %42,6 / hol %36,3 / MaxDD %34,4; Sharpe ve DD aylıkla eşit).',
      'Bant denetimi ve dengeleme AYNI QQQ işlem günü kapanışında (D2; hafta sonu aktarım yok). Ertesi gün yürütmede holdout Sharpe ölçütü 0,002 farkla sınırda — değeri operasyonel (aktarım 105 → 13).'],
    rozetler: ['elle', 'otomatik-demo'], hesap: 'ABD aracı kurum + Binance', dengeleme: 'bant ±10 puan — Hücum %40–%60 dışına çıkınca tam 50/50 (QQQ işlem günü kapanışı), aktarım %0,1', model: 'm-837', labKimlik: null,
    kaynak: { dosya: QQQ_PLAN, satir: '| 837 | %50 QQQ + %50 Hücum | %44,7* | %36,1* | %36,5 | 0,97 |' } },
  { id: 'bist-m10', ad: 'BIST Momentum 10', tur: 'strateji', plan: BIST_PLAN, deneme: 840, kabul: 'kirilgan',
    aciklama: 'Her ay sonu en likit 30 BIST hissesi içinde son 12 ayda (son ay hariç) en çok yükselen 10 hisse, eşit ağırlık; ertesi işlem günü açılışında değiştirilir. Ölçüm USD.',
    kunye: { gel: 9.0, hol: 8.4, tum: null, maxDD: 56.0, p: 0.98, donem: 'geliştirme 2012–2020 · holdout 2021 →' }, kiyas: XU_KIYAS,
    kirilganlik: ['Holdout\'un ~4 puanı tek hisseden (KTLEV, 2026-01 → 09); KTLEV hariç holdout %4,4 < XU030 %6,1 → RED olurdu.',
      'Mutlak getiri düşük (QQQ aynı dönem %20,4 / DD %35,1).', 'Kabul ölçütü H1 baştan ön kayıtta (840–847).'],
    rozetler: ['elle'], hesap: 'BIST aracı kurum (Midas)', dengeleme: 'aylık — ay son BIST işlem günü kapanışı karar, ertesi açılış', model: 'm-bist-m10', labKimlik: 'strateji:bist-m10',
    kaynak: { dosya: BIST_PLAN, satir: '| **840** | **B-M10** | **%9,0** | **%8,4** | **%56,0** | 0,98 |' } },
  // ── Yalnız katalog ─────────────────────────────────────────────────────────
  { id: 'hucum-n-d0x3', ad: 'Hücum-Nasdaq ×3 (DCA\'sız)', tur: 'strateji', plan: QQQ_PLAN, deneme: 836, kabul: 'kirilgan', yalnizKatalog: true,
    aciklama: 'QQQ trend rejimindeyken %100 QQQ + DCA\'sız Donchian hisse kolu ×3 (portföy marjı ister).',
    kunye: { gel: 13.9, hol: 31.0, tum: null, maxDD: 48.0, p: 0.88, donem: 'geliştirme 2005–2015 · holdout 2016 →' }, kiyas: QQQ_KIYAS,
    kirilganlik: ['Geliştirme marjı b\'yi (2,8) tek değişiklikle kaybediyor: Reg-T tavan 2 (+2,45), marj IRX+%3 (+1,66), kayma %0,10 (+1,31), +1 gün gecikme (+0,40), b\'nin hisse maruziyetiyle ölçeklenmesi (≈ 3,3).',
      'Tek hisse: AAPL çıkarılınca (−0,37) kriter 1 düşer; AMZN, NFLX, GOOGL, MU, GILD, CMCSA, BB, AMGN, BKNG\'den biri çıkarılınca da.',
      'Geliştirmede evrenin %30\'u rastgele silinince b şartı çekilişlerin %33\'ünde geçiliyor (%74\'ünde QQQ geçiliyor; MaxDD hepsinde QQQ\'dan düşük).',
      '%6 borç / nakit 0 modelinde kriter 1 ve 4 ✗.',
      'Geliştirme kol evreni %100 hayatta kalanlar (verisi olmayan üye-ay %36,9: YHOO, DELL, BRCM, CELG…).',
      'Uygulama: brüt 3,5–3,7, portföy marjı (≥ 110 000 $), marj oranı gösterge + %1,5 şart. BTC al-tut\'u yenmiyor.'],
    rozetler: ['uygulanamaz'], hesap: 'portföy marjı hesabı (yok)', dengeleme: 'günlük rejim + kol', model: null, labKimlik: null,
    kaynak: { dosya: QQQ_PLAN, satir: '| **836** | **Hücum-N-D0 ×3** | **%13,9** | **%31,0** | **%48,0** | **0,88** |' } },
  { id: 'm-847', ad: '%50 XU030 + %50 Hücum', tur: 'strateji', plan: BIST_PLAN, deneme: 847, kabul: 'kabul', yalnizKatalog: true,
    aciklama: 'Yarısı XU030 endeksi, yarısı Hücum botu; USD bazında ay başı 50/50.',
    kunye: { gel: 32.3, hol: 26.9, tum: null, maxDD: 38.3, p: 1.0, donem: 'geliştirme 2018–2023 · holdout 2024 →' }, kiyas: { ad: 'XU030 al-tut (aynı dönem, USD)', gel: -5.3, hol: 5.1, maxDD: 65.2 },
    kirilganlik: ['Başarı Hücum ayağının: Hücum\'un 2024 sonrası getirisi sıfırlanınca RED.', '837 (%50 QQQ + %50 Hücum) her ölçüde daha iyi — bu yüzden izlenmez.'],
    rozetler: ['elle', 'otomatik-demo'], hesap: 'BIST aracı kurum + Binance', dengeleme: 'aylık — 50/50, aktarım %0,1', model: null, labKimlik: null,
    kaynak: { dosya: BIST_PLAN, satir: '| **847** | **%50 XU030 + %50 Hücum** | **%32,3** | **%26,9** | **%38,3** | 1,00 |' } },
  // ── Kripto botları (PLAN-ALTUT-YENMEK 9./10b. aşama) ───────────────────────
  { id: 'hucum', ad: 'Hücum (BTC trend + Kalkan kolu ×3)', tur: 'strateji', plan: 'PLAN-TRADFI-SIZINTI.md', deneme: 444, kabul: 'kullanici',
    aciklama: 'BTC uzun dönem trendindeyken %100 BTC + 15 coinlik Kalkan kolu ×3 (bindirme); trend dışında USDT.',
    kunye: { gel: null, hol: yuz(bk('hucum').holdout), tum: yuz(bk('hucum').cagr), maxDD: yuz(bk('hucum').maxDD), p: bk('hucum').P, donem: BOT_DONEM }, kiyas: BTC_KIYAS,
    kirilganlik: ['Gün içi kötümser en kötü gün −%30,6 (2025-10-10): −%20 güvenlik kriteri geçmedi; kullanıcı −%35 teorik sınırı onayladı (YOL 1).',
      'Gömlek testi: BTC ayağının zamanlama becerisi kanıtlanmadı (düşüş azaltıcı).', 'Simülasyon iyimser (yüzlerce denemeden seçildi); bootstrap P katı Holm düzeltmesinde geçmez.'],
    rozetler: ['otomatik-demo'], hesap: 'Binance (demo)', dengeleme: 'bot kendi kararını verir (günlük)', model: null, labKimlik: 'strateji:hucum',
    kaynak: null, kaynakKayit: BOT_KAYNAK },
  { id: 'denge', ad: 'Denge (BTC trend ×0,5 + Kalkan kolu ×3)', tur: 'strateji', plan: 'PLAN-TRADFI-SIZINTI.md', deneme: 443, kabul: 'olcum',
    aciklama: 'Hücum\'un yarım BTC paylı biçimi: trendde %50 BTC + Kalkan kolu ×3.',
    kunye: { gel: null, hol: yuz(bk('denge').holdout), tum: yuz(bk('denge').cagr), maxDD: yuz(bk('denge').maxDD), p: bk('denge').P, donem: BOT_DONEM }, kiyas: BTC_KIYAS,
    kirilganlik: ['TradFi sonrası P(>BTC) 0,69 — 0,70 çıtasının altında.', 'Risk menüsü satırı (p = 0,5), ayrı ön kayıtlı kabul değil; gün içi en kötü −%22,8.', 'Hücum ↔ Denge korelasyonu 0,98: çeşitlendirme yok.'],
    rozetler: ['otomatik-demo'], hesap: 'Binance (demo)', dengeleme: 'bot kendi kararını verir (günlük)', model: null, labKimlik: 'strateji:denge',
    kaynak: null, kaynakKayit: BOT_KAYNAK },
  { id: 'kalkan', ad: 'Kalkan kolu (Donchian + DCA, ×1)', tur: 'strateji', plan: ALTUT_PLAN, deneme: null, kabul: 'olcum',
    aciklama: 'BTC dışındaki 15 coinlik nokta-zamanlı evrende Donchian (trend takibi) + DCA (kademeli alım) bacakları. Hücum/Denge\'nin bileşeni.',
    kunye: { gel: null, hol: null, tum: null, maxDD: null, p: null, donem: 'tek başına kabul ölçümü yok' }, kiyas: null,
    kirilganlik: ['Tek başına ölçülüp kabul edilmedi; yalnız bileşen.', 'Hücum ↔ Kalkan korelasyonu 0,68.'],
    rozetler: ['otomatik-demo'], hesap: 'Binance (Hücum/Denge içinde)', dengeleme: 'bot içinde', model: null, labKimlik: 'strateji:kalkan',
    kaynak: null },
  // ── Çok varlıklı portföy (PLAN-PORTFOY-STRATEJI) ───────────────────────────
  { id: 'm2-faber', ad: 'M2 Dengeli: sabit ağırlık + Faber 10 ay trend', tur: 'strateji', plan: PS_PLAN, deneme: 681, kabul: 'kabul',
    aciklama: 'Çok hesaplı portföy (QQQ, tahvil, altın, kripto…) sabit ağırlık; her kol ay sonunda 10 aylık ortalamasının altındaysa nakde geçer.',
    kunye: { gel: null, hol: 16.3, tum: 14.5, maxDD: 11.1, p: null, donem: 'tüm örneklem dışı 2017-01 → 2026-10 · holdout 2024 →' }, kiyas: { ad: '60/40 QQQ/SHY', hol: 16.8, tum: 14.0, maxDD: 23.9 },
    kirilganlik: ['Holdout boğa döneminde sabit ağırlıktan 3–6 puan az kazandı: trend filtresi sigorta, getiri artırıcı değil.', 'MaxDD 2020-03\'te: aylık filtre ani çöküşe tepki veremez.',
      'Bootstrap kuyruğu dar gösterir; bütçe kararında stres satırı dikkate alınmalı.'],
    rozetler: ['elle'], hesap: 'çok hesaplı', dengeleme: 'çeyreklik + 5 puan bant', model: null, labKimlik: null,
    kaynak: { dosya: PS_PLAN, satir: '| holdout CAGR / DD | %10,2 / %2,7 · %9,8 / %2,5 | %16,3 / %5,8' } },
  // ── RED adaylar (yalnız bilgi; aynı PLAN tabloları) ────────────────────────
  ...[
    [831, 'M10-F (M10 + Faber filtresi)', 14.2, 16.8, 39.6, 0.51, '| 831 | M10-F | %14,2 | %16,8 | %39,6 | 0,51 |'],
    [832, 'LRS-2 QQQ (trendde ×2)', 8.9, 27.2, 47.6, 0.68, '| 832 | LRS-2 QQQ | %8,9 | %27,2 | %47,6 | 0,68 |'],
    [833, 'LRS-2 M10 (M10 ×2, trendde)', 21.3, 25.0, 69.0, 0.81, '| 833 | LRS-2 M10 | %21,3 | %25,0 | %69,0 | 0,81 |'],
    [834, 'Hücum-Nasdaq ×2 (DCA\'sız)', 11.2, 24.9, 40.1, 0.71, '| 834 | Hücum-N-D0 ×2 | %11,2 | %24,9 | %40,1 | 0,71 |'],
    [835, 'QQQ + Donchian kolu ×1 (bindirme)', 13.9, 27.6, 59.9, 1.0, '| 835 | QQQ + Donchian ×1 | %13,9 | %27,6 | %59,9 | 1,00 |'],
  ].map(([no, ad, gel, hol, dd, p, satir]) => ({ id: `red-${no}`, ad, tur: 'strateji', plan: QQQ_PLAN, deneme: no, kabul: 'red', yalnizKatalog: true,
    aciklama: 'Nasdaq\'ta QQQ al-tut\'u yenme denemesi — ön kayıtlı ölçütle RED.', kunye: { gel, hol, tum: null, maxDD: dd, p, donem: 'geliştirme 2005–2015 · holdout 2016 →' }, kiyas: QQQ_KIYAS,
    kirilganlik: [], rozetler: [], hesap: '—', dengeleme: '—', model: null, labKimlik: null, kaynak: { dosya: QQQ_PLAN, satir } })),
  ...[
    [841, 'B-M10-F', 0.8, 9.0, 60.7, 0.79, '| 841 | B-M10-F | %0,8 | %9,0 | %60,7 | 0,79 |'],
    [842, 'B-LRS-2 (XU030 ×2, trendde)', -15.8, -3.1, 95.1, 0.05, '| 842 | B-LRS-2 | −%15,8 | −%3,1 | %95,1 | 0,05 |'],
    [843, 'B-LRS-2 M10', 3.4, -9.5, 83.2, 0.47, '| 843 | B-LRS-2 M10 | %3,4 | −%9,5 | %83,2 | 0,47 |'],
    [844, 'B-Hücum ×2', -9.8, 5.2, 90.2, 0.23, '| 844 | B-Hücum-D0 ×2 | −%9,8 | %5,2 | %90,2 | 0,23 |'],
    [845, 'B-Overlay (XU030 + Donchian ×1)', -4.4, 7.4, 81.6, 0.55, '| 845 | B-Overlay | −%4,4 | %7,4 | %81,6 | 0,55 |'],
    [846, 'B-Hücum ×3', -10.1, 5.2, 92.8, 0.28, '| 846 | B-Hücum-D0 ×3 | −%10,1 | %5,2 | %92,8 | 0,28 |'],
  ].map(([no, ad, gel, hol, dd, p, satir]) => ({ id: `red-${no}`, ad, tur: 'strateji', plan: BIST_PLAN, deneme: no, kabul: 'red', yalnizKatalog: true,
    aciklama: 'BIST\'te XU030\'u yenme denemesi — ön kayıtlı ölçütle RED.', kunye: { gel, hol, tum: null, maxDD: dd, p, donem: 'geliştirme 2012–2020 · holdout 2021 →' }, kiyas: XU_KIYAS,
    kirilganlik: [], rozetler: [], hesap: '—', dengeleme: '—', model: null, labKimlik: null, kaynak: { dosya: BIST_PLAN, satir } })),
  // ── Kıyas yapı taşları ─────────────────────────────────────────────────────
  { id: 'qqq-altut', ad: 'QQQ al-tut', tur: 'kiyas', plan: QQQ_PLAN, deneme: null, kabul: 'kiyas',
    aciklama: 'Nasdaq-100 endeks fonu; alıp tutmak. Nasdaq stratejilerinin geçmesi gereken taban.',
    kunye: { gel: 10.6, hol: 20.3, tum: null, maxDD: 53.4, p: null, donem: 'geliştirme 2005–2015 · holdout 2016 →' }, kiyas: null, kirilganlik: [],
    rozetler: ['elle'], hesap: 'ABD aracı kurum', dengeleme: 'yok', model: null, labKimlik: 'yahoo:QQQ',
    kaynak: { dosya: QQQ_PLAN, satir: 'QQQ al-tut: gel %10,6 · hol %20,3 · MaxDD %53,4' } },
  { id: 'btc-altut', ad: 'BTC al-tut', tur: 'kiyas', plan: ALTUT_PLAN, deneme: null, kabul: 'kiyas',
    aciklama: 'Bitcoin\'i alıp tutmak. Kripto botlarının geçmesi gereken taban.',
    kunye: { gel: null, hol: 27.1, tum: 42.0, maxDD: 76.7, p: null, donem: 'bot dönemi 2020-09 →' }, kiyas: null, kirilganlik: [],
    rozetler: ['elle'], hesap: 'Binance', dengeleme: 'yok', model: null, labKimlik: 'strateji:btc-altut',
    kaynak: { dosya: ALTUT_PLAN, satir: '| BTC al-tut | %42,0 | %27,1 | %76,7 |' } },
  { id: 'xu030-altut', ad: 'XU030 al-tut (USD)', tur: 'kiyas', plan: BIST_PLAN, deneme: null, kabul: 'kiyas',
    aciklama: 'BIST 30 fiyat endeksi (temettüsüz), dolar bazında. BIST stratejilerinin tabanı.',
    kunye: { gel: -4.1, hol: 6.1, tum: null, maxDD: 78.2, p: null, donem: 'geliştirme 2012–2020 · holdout 2021 →' }, kiyas: null, kirilganlik: [],
    rozetler: ['elle'], hesap: 'BIST aracı kurum', dengeleme: 'yok', model: null, labKimlik: 'yahoo:XU100.IS',
    labNot: 'Laboratuvar kataloğunda XU030 yok — risk özetinde XU100 (TL fiyat endeksi) vekil olarak kullanılır.',
    kaynak: { dosya: BIST_PLAN, satir: 'XU030 al-tut 2012 →: gel −%4,1 · hol %6,1 · DD %78,2' } },
  { id: 'ew-bist30', ad: 'EW BIST30 al-tut (USD)', tur: 'kiyas', plan: BIST_PLAN, deneme: null, kabul: 'kiyas',
    aciklama: 'En likit 30 hissenin eşit ağırlıklı sepeti, aylık, temettü ve maliyet dahil (dolar bazında).',
    kunye: { gel: 4.0, hol: 4.1, tum: null, maxDD: 61.1, p: null, donem: 'geliştirme 2012–2020 · holdout 2021 →' }, kiyas: null, kirilganlik: [],
    rozetler: ['elle'], hesap: 'BIST aracı kurum', dengeleme: 'aylık', model: null, labKimlik: null,
    kaynak: { dosya: BIST_PLAN, satir: 'EW BIST30 %4,0 / %4,1 / %61,1' } },
];

/** Kurucunun seçebildiği kollar → Laboratuvar katalog kimliği (risk özeti motor.simule ile). */
const KOLLAR = [
  { strateji: 'qqq-altut', ad: 'QQQ al-tut', labKimlik: 'yahoo:QQQ', hesap: 'abd-araci' },
  { strateji: 'qqq-m10', ad: 'Nasdaq Momentum 10', labKimlik: 'strateji:qqq-m10', hesap: 'abd-araci' },
  { strateji: 'bist-m10', ad: 'BIST Momentum 10', labKimlik: 'strateji:bist-m10', hesap: 'tr-banka' },
  { strateji: 'hucum', ad: 'Hücum', labKimlik: 'strateji:hucum', hesap: 'binance' },
  { strateji: 'denge', ad: 'Denge', labKimlik: 'strateji:denge', hesap: 'binance' },
  { strateji: 'kalkan', ad: 'Kalkan kolu', labKimlik: 'strateji:kalkan', hesap: 'binance' },
  { strateji: 'btc-altut', ad: 'BTC al-tut', labKimlik: 'strateji:btc-altut', hesap: 'binance' },
  { strateji: 'xu030-altut', ad: 'BIST endeksi (XU100 vekil)', labKimlik: 'yahoo:XU100.IS', hesap: 'tr-banka', not: 'XU030 Laboratuvar kataloğunda yok; XU100 vekil' },
  { strateji: 'tahvil-kisa', ad: 'Kısa vadeli ABD tahvili (SHY)', labKimlik: 'yahoo:SHY', hesap: 'abd-araci' },
];

/** Kabul edilmiş birleşimler (yüzde ağırlık). `katalog`: künyesi olan kayıt. */
const SABLONLAR = [
  { id: 't-837', ad: '%50 QQQ + %50 Hücum (837)', katalog: 'm-837', kollar: [{ strateji: 'qqq-altut', agirlik: 50 }, { strateji: 'hucum', agirlik: 50 }], dengeleme: 'bant-gunluk-10' },
  { id: 't-830', ad: 'Nasdaq Momentum 10 (830)', katalog: 'qqq-m10', kollar: [{ strateji: 'qqq-m10', agirlik: 100 }], dengeleme: 'aylik' },
  { id: 't-840', ad: 'BIST Momentum 10 (840)', katalog: 'bist-m10', kollar: [{ strateji: 'bist-m10', agirlik: 100 }], dengeleme: 'aylik' },
  { id: 't-847', ad: '%50 XU030 + %50 Hücum (847)', katalog: 'm-847', kollar: [{ strateji: 'xu030-altut', agirlik: 50 }, { strateji: 'hucum', agirlik: 50 }], dengeleme: 'aylik' },
  { id: 't-hucum', ad: 'Hücum tek başına', katalog: 'hucum', kollar: [{ strateji: 'hucum', agirlik: 100 }], dengeleme: 'aylik' },
];

/** Kurucu dengeleme anahtarı → Laboratuvar motoru (lib/portfoy/motor.js) dengeleme tanımı. */
const DENGELEME_TANIM = {
  aylik: { siklik: 'aylik', bant: 0 }, ceyrek: { siklik: 'ceyrek', bant: 0 }, yillik: { siklik: 'yillik', bant: 0 }, yok: { siklik: 'yok', bant: 0 },
  'bant-gunluk-10': { siklik: 'bant', bant: 0.10, denetim: 'gunluk' },
};
const DENGELEME_AD = { aylik: 'aylık (ay sonu tam)', ceyrek: 'çeyreklik', yillik: 'yıllık', yok: 'dengeleme yok', 'bant-gunluk-10': 'bant ±10 puan (her işlem günü)' };

const ETIKET_SABLON = 'kabul edilmiş şablon';
const ETIKET_OLCULMEMIS = 'ölçülmemiş birleşim — simülasyon, kabul değil';
/** Kollar ([{ strateji, agirlik(%) }]) + dengeleme bir kabul edilmiş şablonla aynı mı? → { sablon, etiket, kabul } */
function etiketle(kollar, dengeleme) {
  const k = (kollar || []).filter(x => x && x.strateji && Number(x.agirlik) > 0);
  const top = k.reduce((a, x) => a + Number(x.agirlik), 0);
  for (const s of SABLONLAR) {
    if (s.dengeleme !== dengeleme || s.kollar.length !== k.length || !(top > 0)) continue;
    const ayni = s.kollar.every(sk => { const x = k.find(y => y.strateji === sk.strateji); return x && Math.abs(Number(x.agirlik) * 100 / top - sk.agirlik) <= 0.5; });
    if (ayni) return { sablon: s.id, etiket: ETIKET_SABLON, kabul: true, katalog: s.katalog };
  }
  return { sablon: null, etiket: ETIKET_OLCULMEMIS, kabul: false, katalog: null };
}

const liste = () => KAYITLAR.map(x => JSON.parse(JSON.stringify(x)));
const kayit = id => { const x = KAYITLAR.find(y => y.id === id); return x ? JSON.parse(JSON.stringify(x)) : null; };

module.exports = { liste, kayit, KOLLAR, SABLONLAR, etiketle, ETIKET_SABLON, ETIKET_OLCULMEMIS, H1_UYARI, DENGELEME_TANIM, DENGELEME_AD };
