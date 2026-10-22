/**
 * İLERİ TEST EKRANI — #/ileri `AG.pages.ileri` (63.1; kullanıcıyla taslak 1–2 üzerinden)
 * ═══════════════════════════════════════════════════════════════════════════
 * "Her şey yolunda mı, sıradaki karar ne zaman?" Sayfanın sırası:
 *   · Ara rapor notu — sayfa başında BİR KEZ (index.html).
 *   · KARAR TAKVİMİ (#ileriTakvim) — bütün karar / kontrol günleri tek çizelgede (`takvimModel`).
 *   · GRAFİKLER (#ileriGrafikler) — her test kendi grafiği (`grafikModeli`): Hücum ve Denge simülasyonunun en derin
 *     düşüşü (uyarı / alarm eşik çizgileriyle), Bollinger (BTC: mevcut kural ↔ Bollinger'li), yan denemeler (günlüğe
 *     göre birikimli fark), demo uygulama sapması (incele / sınır çizgileriyle). Seriler sunucudan (lib/ileri: golge.seri,
 *     btc.seri, zamanDilimi.seri, rangeVeto.seri, demo.uygulama.seri) — yalnız betimleyici.
 *   · SADE KARTLAR — tek cümle, büyük durum, 2 ana sayı, karar günü, ayrıntı katlı:
 *       1. Bollinger düşüş azaltıcı (`/api/ileri/bollinger`, PLAN-ILERI-BOLLINGER)
 *       2. Hücum / Denge simülasyonu (aynı rapor `golge.model` + `/api/ileri/kabul` kontrol noktaları; yan denemeler:
 *          3 günlük karar PLAN-GOLGE-3D, yatay piyasa filtresi PLAN-GOLGE-D3, 1000 $'lık Hücum eşiği)
 *       3. Demo kabul protokolü — Hücum demo hesabı (`/api/ileri/kabul` demo; PLAN-DEMO-KABUL) + 64.4 kabul raporu bölümü
 *          (`/api/ileri/kabul-rapor`, scripts/demo-kabul-rapor.js ile aynı hesap — `demoRaporModel`): ölçüt tablosu, Gün N / 63,
 *          §8.2 kayıt başlangıcı, prova günlüğü; genel hüküm yalnız 63. günden sonra
 *       4. EUR/USD — CBDR ile Londra girişi (63.7; `/api/ileri/cbdr`, PLAN-ILERI-CBDR, deneme 864): işlem sayısı, ortalama R,
 *          sıradaki gün (koşul / limit seviyesi — canlı), birikimli R grafiği, takvimde ara kontrol + karar günü
 *       5. 876 gölge — Hücum %90 + TVL L/S %10 (64.9; `/api/ileri/876`, PLAN-ILERI-876, deneme 882): bu ayın sepeti (long/short
 *          sayısı), bu ay, başlangıçtan beri, birlikte ↔ Hücum, vazgeçme kuralı, rapor günü 2027-01-01; "istatistiksel kanıt değildir"
 *
 * PROJE KURALI: ARA RAPORDA HÜKÜM YAZILMAZ. Yalnız betimlenir; "geçti/kaldı/kabul" yazılmaz, kural önerilmez. Önceden kayda
 * geçirilmiş uyarı / alarm eşikleri (eski adı p95 / p99) hüküm değil, izleme kuralıdır ve gösterilir.
 * Sade terimler (63.1): gölge → simülasyon, p95/p99 → uyarı/alarm eşiği, D3 range vetosu → yatay piyasa filtresi,
 * 3 günlük aday → 3 günlük karar, Hücum-S → 1000 $'lık Hücum, hüküm tarihi → karar günü.
 *
 * Saf görünüm modelleri test edilir; çizim AG.dom ile (sunucu metni her zaman metin).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  let zaman = 0;

  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const yuzde = (x, b = 1) => (!sayiMi(x) ? '—' : `${x < 0 ? '−' : ''}%${Math.abs(x * 100).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b })}`);
  const karar = (k) => (k == null ? '—' : k ? 'alımda' : 'nakitte');
  const kalanMetin = (n) => (sayiMi(n) ? `${n.toLocaleString('tr-TR')} gün kaldı` : '');

  /** 'YYYY-AA-GG' → "7 Ekim 2027" (sade özet cümleleri için). */
  const tarihAdi = (g) => { const m = String(g || '').match(/^(\d{4})-\d{2}-\d{2}$/); return m ? `${(AG.botDil && AG.botDil.gunAdi ? AG.botDil.gunAdi : (x) => x)(g)} ${m[1]}` : String(g || '—'); };
  const bugunStr = () => (AG.botDil && AG.botDil.yerelGun ? AG.botDil.yerelGun() : new Date().toISOString().slice(0, 10));

  /* ── Görünüm modelleri (saf) ─────────────────────────────────────────── */

  /** Bollinger düşüş azaltıcı. */
  function bollingerModel(v) {
    if (!v || !v.success || !v.rapor) return { hata: `Rapor alınamadı: ${(v && v.error) || 'bilinmeyen hata'}` };
    const r = v.rapor, h = v.hukum || {}, iz = v.izleyici || {}, b = r.btc;
    const sc = iz.sonCalisma;
    const durum = iz.sonHata ? { metin: 'İzleyici hata verdi', ton: 'uyari' }
      : !sc ? { metin: 'İzleyici henüz çalışmadı', ton: 'uyari' } : { metin: 'Ölçüm sürüyor', ton: '' };
    // Denetim A-34: kartın başında tek cümle sade özet.
    const ozet = `${r.dusus.sayi ? `${r.dusus.sayi} seride büyük düşüş oldu` : 'Henüz büyük düşüş olayı yok'}${b && b.gun ? `. BTC'de en derin düşüş: mevcut kuralla ${yuzde(b.C0.maxdd)}, Bollinger'li kuralla ${yuzde(b.C1.maxdd)}` : ''}. Karar ${tarihAdi(r.sonrakiHukumTarihi)}.`;
    return {
      baslik: 'Bollinger düşüş azaltıcı',
      ozet,
      durum,
      ana: [1, 3],
      sayilar: [
        { etiket: 'Geçen gün', deger: String(r.gecenGun), alt: `başlangıç ${r.baslangic}` },
        { etiket: 'Düşüş olayı', deger: `${r.dusus.sayi} / ${r.dusus.esikSeri}`, alt: `al-tut düşüşü ≥ ${yuzde(r.dusus.ddEsik, 0)} olan seri`, ton: r.dusus.olay ? 'tone-warning' : '' },
        { etiket: 'Daha az düşen (mevcut / Bollinger’li)', yardim: 'bollingerKiyas', deger: r.kiyas.n ? `${r.kiyas.c0Dusuk} / ${r.kiyas.c1Dusuk}` : '—', alt: r.kiyas.n ? `${r.kiyas.n} seride (eşit ${r.kiyas.esit})` : 'getiri günü birikince dolar' },
        { etiket: 'BTC en derin düşüş (mevcut / Bollinger’li)', yardim: 'bollingerKiyas', deger: b && b.gun ? `${yuzde(b.C0.maxdd)} / ${yuzde(b.C1.maxdd)}` : '—', alt: b && b.sonKarar ? `son karar ${karar(b.sonKarar.C0)} / ${karar(b.sonKarar.C1)}` : 'BTC kaydı bekleniyor' }
      ],
      hukumTarihi: r.sonrakiHukumTarihi || '—',
      hukumAlt: [kalanMetin(r.kalanGun), h.durum === 'ertelendi' ? 'ertelendi — düşüş olayı yoksa 2028-10-07' : 'en az bir düşüş olayı varsa; yoksa 2028-10-07'].filter(Boolean).join(' · '),
      not: [
        `Kayıt: ${r.kayitliSeri}/${r.toplamSeri} seri, ${r.satirSayisi} satır, son karar günü ${r.sonKararGunu || '—'}${r.gecikmeliSatir ? ` (${r.gecikmeliSatir} satır sonradan yazıldı: izleyici o gün çalışmadığı için ertesi çalışmada tamamlandı — karar o günün verisiyle, değişmez)` : ''}.`,
        sc ? `Son çalışma ${AG.fmt ? AG.fmt.tarihSaat(sc.zaman) : sc.zaman}${sc.eksik && sc.eksik.length ? ` · indirilemeyen: ${sc.eksik.map(e => e.seri).join(', ')}` : ''}${sc.golgeHata ? ` · simülasyon hatası: ${sc.golgeHata}` : ''}.` : 'İzleyici sunucu açılıştan 1 dk sonra ve her gün 00:15 UTC sonrası çalışır.',
        iz.calisiyor ? 'Şu an çalışıyor…' : '',
        iz.sonHata ? `Son deneme hatası: ${iz.sonHata}` : ''
      ].filter(Boolean).join(' ')
    };
  }

  const puan = (x) => (!sayiMi(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} puan`);
  /**
   * 3 günlük karar (yan deneme; PLAN-GOLGE-3D, deneme 635) — Hücum/Denge kartında tek satır, betimleyici.
   * `z` = /api/ileri/bollinger `zamanDilimi` (lib/ileri/zamanDilimiGolge.panelOzet). Değer: günlüğe göre birikimli
   * Hücum farkı (log puan); hüküm yazılmaz, önceden kayda geçmiş "vazgeç" izleme kuralı tonla gösterilir.
   */
  function ucGunSatiri(z) {
    const etiket = '3 günlük karar (yan deneme)';
    const yardimK = 'ucGunlukAday';
    if (!z || z.hata || !z.A) return { etiket, yardim: yardimK, deger: '—', alt: z && z.hata ? `okunamadı: ${z.hata}` : 'kayıt bekleniyor (sunucu yeniden başlatılınca görünür)' };
    const A = z.A, Y = z.Y || {};
    return {
      etiket, yardim: yardimK,
      deger: z.gecenGun ? puan(A.sumH) : '—',
      alt: [`günlüğe göre · şimdi ${karar(A.sonKarar)} (günlük ${karar(z.tabanSonKarar)})`, `farklı gün ${A.farkliGun} / ${z.olayGun}`,
        `yedek ${z.gecenGun ? puan(Y.sumH) : '—'}`, A.durum === 'vazgeçildi' ? 'vazgeç kuralı tetiklendi' : '', `karar ${z.hukumTarihi}`].filter(Boolean).join(' · '),
      ton: A.durum === 'vazgeçildi' ? 'tone-warning' : ''
    };
  }

  /**
   * Yatay piyasa filtresi (yan deneme; eski adı D3 range vetosu, PLAN-GOLGE-D3, deneme 764) — betimleyici.
   * `d` = /api/ileri/bollinger `rangeVeto` (lib/ileri/rangeVetoGolge.panelOzet).
   */
  function d3Satiri(d) {
    const etiket = 'Yatay piyasa filtresi (yan deneme)';
    if (!d || d.hata || !d.olay) return { etiket, yardim: 'veto', deger: '—', alt: d && d.hata ? `okunamadı: ${d.hata}` : 'kayıt bekleniyor (ilk karar günü 2026-10-09; sunucu açılınca yazılır)' };
    return {
      etiket, yardim: 'veto',
      deger: d.gecenGun ? puan(d.sumH) : '—',
      alt: [`günlüğe göre · şimdi ${karar(d.sonKarar)} (günlük ${karar(d.tabanSonKarar)})`, d.bugunVeto ? 'bugün yatay piyasa: yeni giriş engelli' : '',
        `filtre günü ${d.vetoOlayi} (karara gereken ${d.olay.vetoOlayi}) · kararı farklı gün ${d.farkliGun} (gereken ${d.olay.farkliGun})`,
        d.durum === 'vazgeçildi' ? 'vazgeç kuralı tetiklendi' : '', `karar ${d.hukumTarihi}`].filter(Boolean).join(' · '),
      ton: d.durum === 'vazgeçildi' ? 'tone-warning' : ''
    };
  }

  /**
   * 1000 $'lık Hücum alarm eşiği (eski adı Hücum-S; denetim A-17, deneme 861, karar Ö9 / G3b): canlı hesaba geçiş planı bunun
   * üzerine kurulu. Ayrı simülasyonu yok — eşik Hücum simülasyonuna uygulanır. `hs` = /api/ileri/kabul hucumDenge.hucumS.
   */
  function hucumSSatiri(hs, hucum) {
    const etiket = '1000 $’lık Kairos alarm eşiği';
    if (!hs || !Array.isArray(hs.bantlar) || !hs.bantlar.length) return { etiket, deger: '—', alt: 'eşik bilgisi alınamadı', yardim: 'p95p99' };
    const ufuk = hucum && hucum.ufuk;
    const b = hs.bantlar.find(x => x.ufuk === ufuk) || hs.bantlar[0];
    const asim = hucum && sayiMi(hucum.maxdd) ? (hucum.maxdd > b.p99 ? 'tone-danger' : hucum.maxdd > b.p95 ? 'tone-warning' : '') : '';
    return { etiket, yardim: 'p95p99', deger: yuzde(b.p99), ton: asim,
      alt: `${hs.bantlar.map(x => `${x.ufuk} g ${yuzde(x.p99)}`).join(' / ')} · ayrı simülasyonu yok, Kairos simülasyonuna uygulanıyor` };
  }

  /** Hücum / Denge simülasyonu (model izleme). `k` = /api/ileri/kabul yanıtı (kontrol noktaları). */
  function hucumDengeModel(v, k, bugun) {
    const g = v && v.rapor && v.rapor.golge;
    const m = g && g.model;
    const kontrol = (k && k.hucumDenge && k.hucumDenge.kontrol) || [];
    const kutu = (ad, x) => {
      const etiket = `${ad === 'hucum' ? 'Kairos' : 'Tao'} simülasyonu en derin düşüş`;
      if (!x) return { etiket, deger: '—', alt: 'ilk ileri gün 2026-10-07', yardim: 'golgeMaxdd' };
      return {
        etiket, yardim: 'golgeMaxdd',
        deger: yuzde(x.maxdd),
        alt: `${x.ufuk} g · uyarı eşiği ${yuzde(x.p95)} · alarm eşiği ${yuzde(x.p99)}`,
        ton: x.durum === 'DUR' ? 'tone-danger' : x.durum === 'uyari' ? 'tone-warning' : ''
      };
    };
    const durumlar = m ? [m.hucum, m.denge].filter(Boolean).map(x => x.durum) : [];
    const enKotu = durumlar.includes('DUR') ? 'DUR' : durumlar.includes('uyari') ? 'uyari' : 'normal';
    const gun = bugun || bugunStr();
    const sonraki = kontrol.find(n => n.tarih >= gun) || kontrol[kontrol.length - 1] || null;
    const son = kontrol[kontrol.length - 1] || null;
    const hs = hucumSSatiri(k && k.hucumDenge && k.hucumDenge.hucumS, m && m.hucum);
    const hx = m && m.hucum, dx = m && m.denge;
    const ozet = !m ? 'Simülasyon kaydı bekleniyor.'
      : `Kairos simülasyonunun en derin düşüşü ${yuzde(hx && hx.maxdd)} (alarm eşiği ${yuzde(hx && hx.p99)})${dx ? `, Tao ${yuzde(dx.maxdd)} (alarm ${yuzde(dx.p99)})` : ''} — ${enKotu === 'normal' ? 'eşiğin altında' : enKotu === 'uyari' ? 'uyarı eşiği aşıldı' : 'alarm eşiği aşıldı'}. Sıradaki kontrol ${sonraki ? tarihAdi(sonraki.tarih) : '—'}.`;
    return {
      baslik: 'Kairos / Tao simülasyonu',
      ozet,
      durum: !m ? { metin: 'Simülasyon kaydı bekleniyor', ton: 'uyari' }
        : enKotu === 'DUR' ? { metin: 'Alarm eşiği aşıldı', ton: 'tehlike' }
          : enKotu === 'uyari' ? { metin: 'Uyarı eşiği aşıldı', ton: 'uyari' } : { metin: 'Eşiğin altında', ton: 'iyi' },
      ana: [0, 1],
      sayilar: [
        kutu('hucum', m && m.hucum),
        kutu('denge', m && m.denge),
        { etiket: 'Simülasyon günü', deger: g ? String(g.gun) : '—', alt: g && g.ilk ? `${g.ilk} → ${g.son}` : 'izleyicinin simülasyon satırları' },
        { etiket: 'Sonraki kontrol', deger: sonraki ? sonraki.tarih : '—', alt: sonraki ? `${sonraki.gun}. gün` : '' },
        ucGunSatiri(v && v.zamanDilimi),
        d3Satiri(v && v.rangeVeto),
        hs
      ],
      hukumTarihi: son ? son.tarih : '—',
      hukumAlt: kontrol.length ? `kontrol noktaları ${kontrol.map(n => `${n.gun} g (${n.tarih})`).join(' · ')}; 365. günde BTC al-tut kıyası raporlanır` : '',
      not: 'Kairos / Tao (eski adları Hücum / Denge) simülasyonu = araştırma modelinin aynı günlerdeki "olması gereken" sonucu (emir yok). Eşikler önceden kayda geçirildi; uyarı eşiği aşımı neden analizi ister, alarm eşiği aşımı modeli geçersiz sayar — kural DEĞİŞMEZ.'
    };
  }

  /* ── 64.4 Demo kabul raporu (scripts/demo-kabul-rapor.js ile aynı hesap; /api/ileri/kabul-rapor) ── */
  /** Ölçütlerin sade adları (tam tanım kılavuzda — İleri test › Demo kabul raporu). */
  const OLCUT_ADI = {
    U1: 'Simülasyondan sapma (30 g)', U2: 'Sapma, funding farkı çıkarılmış', U3: 'Günlük büyük sapma (gün)', U4: 'İşlem maliyeti (kayma + ücret)',
    U5: 'Ücret', U6: 'Botun olmayan coinde funding', U8a: 'Rejim geçişi günü maliyeti', U8b: 'Ay başı maliyeti',
    I1: 'Defter ↔ borsa tutarlılığı', I2: 'Botun kendini durdurması', I3a: 'Açıklanamayan hata alarmı', I3b: 'Açıklanmış alarm',
    I4a: 'Koruma stopu kapsamı', I4b: 'Kaybolan koruma stopu', I4c: 'Tetiklenen stop sonrası', I5: 'En yüksek teminat oranı',
    I6: 'Kaçırılan gün', I7: 'Zamanında çalışma (00:02–00:30 UTC)', I8: 'Çökme', I9: 'Küçük kaldığı için verilmeyen emir'
  };
  const OLCUT_YUZDE = new Set(['U1', 'U2', 'I4a', 'I5', 'I7', 'I9']);
  const OLCUT_BP = new Set(['U4', 'U5', 'U8a', 'U8b']);
  const DURUM_TON = { 'GEÇTİ': 'iyi', 'İNCELE': 'uyari', 'GEÇMEDİ': 'tehlike', 'ÖLÇÜLEMEDİ': '' };
  const olcutDegeri = (o) => {
    const x = o.deger;
    if (x == null) return '—';
    if (typeof x === 'string') return x;
    if (!sayiMi(x)) return '—';
    if (OLCUT_YUZDE.has(o.kod)) return yuzde(x, 1);
    if (OLCUT_BP.has(o.kod)) return `${x.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} bp`;
    return x.toLocaleString('tr-TR');
  };
  /** Sunucu notundaki iç adlar sade dile (plan dosya adı, ön koşul kodları). */
  const cv = s => (AG.botAd ? AG.botAd.cevir(s) : s);
  const sadeNot = (s) => cv(String(s || '')).replace(/PLAN-ILERI A: DUR/g, 'simülasyonda DUR').replace(/PLAN-ILERI C1/g, 'ön koşul: 30 gün kesintisiz')
    .replace(/PLAN-ILERI C2/g, 'ön koşul: acil durdurma ve mutabakat denemesi').replace(/PLAN-ILERI C3/g, 'ön koşul: sermaye belgesi onayı')
    .replace(/PLAN-ILERI C4/g, 'ön koşul: simülasyonda DUR yok').replace(/PLAN-[A-Z0-9-]+(\.md)?/g, 'ön kayıt').replace(/felaket stopu/g, 'koruma stopu');

  /** 67.5: ISO zaman → Türkiye saati "14.11.2026 20:24" (UTC+3). */
  const trSaat = (z) => {
    const t = Date.parse(z);
    if (!Number.isFinite(t)) return '—';
    const d = new Date(t + 3 * 3600e3); const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  };
  /** 67.5: ölçütü oluşturan olaylar (sunucu panelOzet → ayrinti) → katlı "Ayrıntı" satırları (metin). */
  function ayrintiSatirlari(a) {
    if (!a || !Array.isArray(a.satirlar)) return [];
    if (a.tur === 'olay') return a.satirlar.map(x => `${trSaat(x.zaman)} · ${x.kaynak || 'kaynak yok'} · ${sadeNot(x.metin) || '—'}`);
    if (a.tur === 'alarm') {
      const turler = Object.entries(a.turler || {}).map(([t, n]) => `${t} × ${n.toLocaleString('tr-TR')}`);
      return [...(turler.length ? [`Türler: ${turler.join(' · ')}`] : []),
        ...a.satirlar.map(x => `${trSaat(x.zaman)} · ${x.tur === 'alarm' ? 'alarm' : 'uyarı'} · ${x.baslik}${x.aciklanmis ? ' (açıklanmış)' : ''}${x.kaynak === 'sunucu' ? ' (sunucu bildirimi)' : ''}`)];
    }
    if (a.tur === 'supervisor') {
      return a.satirlar.map(x => `${trSaat(x.zaman)} · çıkış kodu ${x.kod}${x.satir > 1 ? ` (${x.satir.toLocaleString('tr-TR')} satır, 1 dk içinde tek olay)` : ''} · ${x.sinifAd || x.sinif}${x.aciklanmis ? ' (açıklanmış)' : ''}`);
    }
    return [];
  }

  /**
   * Saf: demo kabul raporu bölümü. `rr` = /api/ileri/kabul-rapor yanıtı.
   * → null | { hata } | { veriVar, asama, kilometre, kayit, prova, genel, satirlar: [{ kod, ad, deger, etiket, ton, not }], bos? }
   * Ara raporda (Gün < 63) genel hüküm YOK; ölçüt durumları "… bandında" (sunucu yazar).
   */
  function demoRaporModel(rr) {
    if (!rr) return null;
    if (!rr.success || !rr.rapor) return { hata: `Demo kabul raporu alınamadı: ${(rr && rr.error) || 'sunucu bu sürümü henüz çalıştırmıyor olabilir'}` };
    const r = rr.rapor, p = r.prova || {};
    const yk = r.yeniKayitlar || {};
    const kayit = yk.baslangic
      ? `§8.2 kayıtları ${tarihAdi(String(yk.baslangic).slice(0, 10))} başladı${yk.kapsam && !yk.kapsam.tam ? ` — Gün 0'dan geç, ${yk.kapsam.gun} günü kapsıyor (öncesi ölçülemez)` : ''}`
      : '§8.2 kayıtları henüz yok — sunucudaki bot 64.0 sonrası kodla ilk günlük çalışmayı yapınca başlar';
    const zorunlu = (p.provalar || []).filter(x => x.zorunlu);
    const prova = !p.var
      ? `Prova günlüğü yok — şablon: ${p.sablonKomutu || 'node scripts/demo-kabul-rapor.js --prova-sablon'} (çıktıyı ${p.dosya || 'prova-gunlugu.json'} olarak kaydedip doldurun)`
      : `Prova günlüğü: ${p.zorunluYapilan || 0} / ${p.zorunlu || zorunlu.length} zorunlu prova kayıtlı${zorunlu.length ? ` (${zorunlu.map(x => `${x.no} ${x.yapildi ? 'yapıldı' : x.sonra ? `${x.sonra}. günden sonra` : 'bekliyor'}`).join(' · ')})` : ''}`;
    if (!r.veriVar) {
      return { veriVar: false, bos: 'Gün 0 henüz yok — demo bot sunucuda; rapor orada dolar.', asama: `Gün — / ${r.hedefGun || 63}`,
        kilometre: '30. gün ara rapor · 63. gün hüküm (tarihler Gün 0 ile belli olur)', kayit, prova, genel: 'Ara rapor — hüküm yok', satirlar: [] };
    }
    const kilometre = (r.asamalar || []).map(a => `${a.gun}. gün ${a.ad} ≈ ${tarihAdi(a.tarih)}${a.gecti ? ' (tarihi geldi)' : ''}`).join(' · ');
    const satirlar = (r.olcutler || []).map(o => ({
      kod: o.kod, ad: OLCUT_ADI[o.kod] || o.ad, deger: olcutDegeri(o), etiket: o.etiket || o.durum, ton: DURUM_TON[o.durum] || '',
      not: [o.kod === 'U4' && r.refEksik ? `prod mum referansı yok — ${r.refIpucu}` : sadeNot(o.bilgiNotu ? String(o.not || '').replace(o.bilgiNotu, '').replace(/\s*·\s*$/, '') : o.not), o.kapsam ? `kapsam ${o.kapsam.gun} g` : ''].filter(Boolean).join(' · '),
      // 67.5: sabit bilgi notu (I9 model–canlı farkı) ve katlı ayrıntı (I2 / I3a / I8 olayları)
      bilgi: o.bilgiNotu || null, ayrinti: ayrintiSatirlari(o.ayrinti)
    }));
    const g = r.g1;
    if (g) {
      satirlar.push({ kod: 'G1', ad: 'Getiri / düşüş bandı (ikincil)', ton: DURUM_TON[g.durum] || '', etiket: g.etiket || g.durum,
        deger: g.olcu ? `${yuzde(g.olcu.getiri)} · düşüş ${yuzde(g.olcu.maxdd)}` : '—',
        not: `${g.ufuk} g bandına göre${g.olcu && sayiMi(g.olcu.vol) ? ` · oynaklık ${yuzde(g.olcu.vol)}` : ''} · getiri karara girmez; yalnız düşüş alarm eşiğini aşarsa sayılır` });
    }
    return { veriVar: true, asama: `Gün ${r.gecenGun} / ${r.hedefGun || 63}`, kilometre, kayit, prova,
      genel: r.araRapor || !r.genel || r.genel.hukum == null ? 'Ara rapor — hüküm yok' : sadeNot(r.genel.metin), satirlar };
  }

  /** Demo kabul protokolü (Hücum demo hesabı). `rr` (64.4) = /api/ileri/kabul-rapor yanıtı (yoksa rapor bölümü çizilmez). */
  function demoModel(k, rr) {
    const d = k && k.demo;
    if (!d) return { hata: `Demo durumu alınamadı: ${(k && k.error) || 'bilinmeyen hata'}` };
    const asamalar = d.asamalar || [];
    const faz2 = asamalar.find(a => a.hukum);
    const o = d.olcu, b = d.bant, u = d.uygulama || {}, c = d.calisma || {};
    const bantMetni = { normal: 'normal', incele: 'incelenmeli', engel: 'sınır aşıldı' };
    // Denetim A-14: protokol başlamadıysa nedeni ve yapılacak iş (63.1: güncel yol — Eylemler menüsü 62.6'da kalktı).
    const basBekliyor = !d.veriVar && !c.calisiyor;
    const ozet = basBekliyor ? 'Protokol başlamadı: Kairos demo botu durmuş. Başlatmak için sunucuda Botlar › Kairos › Yönetim\'de hesap türü demo, sonra Genel görünümünde Başlat gerekiyor. İlk günlük çalışma Gün 0 olur; karar Gün 63.'
      : !d.veriVar ? 'Bot çalışıyor; ilk günlük çalışma kaydı (Gün 0) bekleniyor.'
        : `${d.gecenGun}. gün / 63${sayiMi(u.sonFark) ? `, simülasyondan sapma ${yuzde(u.sonFark, 2)}` : ''}. Karar ${faz2 && faz2.tarih ? tarihAdi(faz2.tarih) : 'Gün 0 + 63 gün'}.`;
    return {
      baslik: 'Demo kabul — Kairos demo hesabı',
      ozet,
      eylem: basBekliyor ? { metin: 'Kairos › Genel (Başlat)', href: '#/botlar/hucum/genel' } : null,
      durum: basBekliyor ? { metin: 'Protokol başlamadı — bot durmuş', ton: 'uyari' } : !d.veriVar ? { metin: 'Gün 0 bekleniyor', ton: 'uyari' } : u.engel ? { metin: 'Bot durduruldu — onay bekliyor', ton: 'tehlike' } : { metin: 'Ölçüm sürüyor', ton: '' },
      ana: [0, 1],
      sayilar: [
        { etiket: 'Gün', deger: d.veriVar ? `${d.gecenGun} / 63` : '—', alt: d.gun0 ? `Gün 0: ${d.gun0}` : `ilk günlük çalışma kaydı (${d.gun0Taban} ve sonrası) bekleniyor` },
        { etiket: 'Uygulama sapması (30 g)', yardim: 'uygulamaSapma', deger: sayiMi(u.sonFark) ? yuzde(u.sonFark, 2) : '—', alt: u.sonBant ? `bant: ${bantMetni[u.sonBant] || u.sonBant}` : 'simülasyon farkı henüz yok', ton: u.sonBant === 'engel' ? 'tone-danger' : u.sonBant === 'incele' ? 'tone-warning' : '' },
        { etiket: 'En derin düşüş', deger: o ? yuzde(o.maxdd) : '—', alt: b ? `${b.ufuk} g · uyarı eşiği ${yuzde(b.maxddP95)} · alarm eşiği ${yuzde(b.maxddP99)}` : 'bant dosyası yok', ton: o && b && o.maxdd > b.maxddP99 ? 'tone-danger' : o && b && o.maxdd > b.maxddP95 ? 'tone-warning' : '' },
        { etiket: 'Getiri (betimleyici)', deger: o ? yuzde(o.getiri) : '—', alt: b ? `${b.ufuk} g p5 ${yuzde(b.getiriP5)} — karara girmez` : 'karara girmez' },
        { etiket: 'Kaçırılan gün', deger: sayiMi(c.kacirilanGun) ? String(c.kacirilanGun) : '—', alt: c.kararGun ? `son karar günü ${c.kararGun}` : 'bot kalp kaydı yok' }
      ],
      hukumTarihi: faz2 && faz2.tarih ? faz2.tarih : 'Gün 0 + 63 gün',
      hukumAlt: d.veriVar && faz2 ? `${kalanMetin(faz2.kalanGun)} · ara rapor ${(asamalar[0] || {}).tarih || '—'} (30 g)` : 'Gün 0 = 2026-10-07 ve sonrasındaki ilk günlük çalışma',
      rapor: demoRaporModel(rr),
      not: `${String(d.not || '').replace(/^Ara durum — hüküm değil\.\s*/, '').replace(/hükme/g, 'karara').replace(/hüküm/g, 'karar').replace(/felaket stopu/g, 'koruma stopu').replace(/marj/g, 'teminat')} Bu makinede bot çalışmıyorsa (araştırma kopyası) sayılar yereldeki son kopyadandır.`
    };
  }

  /* ── 63.7 EUR/USD CBDR gölge testi ─────────────────────────────────── */
  const HAFTA = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];
  const haftaAdi = (g) => (/^\d{4}-\d{2}-\d{2}$/.test(String(g || '')) ? HAFTA[new Date(`${g}T00:00:00Z`).getUTCDay()] : '');
  const fiyat = (x) => (!sayiMi(x) ? '—' : x.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 5 }));
  const pip = (x) => (!sayiMi(x) ? '—' : `${(x * 10000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} pip`);
  const rMetin = (x, b = 2) => (!sayiMi(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b })}R`);
  const yonAdi = (y) => (y > 0 ? 'alış' : y < 0 ? 'satış' : '—');
  const NEDEN = { hedef: 'hedefte', stop: 'stopta', zaman: '11:00’de süre dolunca' };

  /**
   * Saf: sıradaki gün satırı. `s` = /api/ileri/cbdr `siradaki` (lib/ileri/cbdrGolge.gunHesapla, o ana kadarki mumlarla).
   * → { deger (kısa durum), alt (ayrıntı), ton }
   */
  function cbdrSiradaki(s) {
    if (!s || !s.gun) return { deger: '—', alt: 'canlı veri alınamadı', ton: 'tone-warning' };
    const gun = `${tarihAdi(s.gun)} ${haftaAdi(s.gun)}`;
    const aralik = sayiMi(s.r) ? `CBDR aralığı ${pip(s.r)} (${fiyat(s.cbL)} – ${fiyat(s.cbH)})` : '';
    const limit = sayiMi(s.limit) && s.yon && sayiMi(s.adr5) ? `${yonAdi(s.yon)} limiti ${fiyat(s.limit)} · stop mesafesi ${pip(0.33 * s.adr5)} · hedef ${fiyat(s.hedef)}` : '';
    const kosulOk = !!(s.kosul && s.kosul.r && s.kosul.asya);
    const x = s.islem;
    if (s.durum === 'bekliyor') {
      if (s.asama === 'cbdr') return { deger: 'Aralık oluşuyor', alt: `${gun} · önceki günün NY 14:00–20:00 aralığı ölçülüyor${aralik ? ` (şimdilik ${pip(s.r)})` : ''}` };
      if (s.asama === 'asya') return { deger: 'Gece bekleniyor', alt: [gun, aralik, s.kosul && !s.kosul.r && sayiMi(s.adr5) ? `aralık şimdiden geniş görünüyor (sınır ≈ ${pip(0.45 * s.adr5)}) — büyük olasılıkla işlem yok` : '', 'yön ve koşul NY gece yarısı (Asya aralığı bitince) belli olur'].filter(Boolean).join(' · ') };
      if (s.asama === 'acik' && x) return { deger: `İşlem açık (${yonAdi(x.yon)})`, alt: `${gun} · giriş ${fiyat(x.giris)} · stop ${fiyat(s.stop)} · hedef ${fiyat(s.hedef)} · en geç NY 11:00’de kapanır`, ton: 'tone-primary' };
      return { deger: kosulOk ? 'Koşul sağlandı' : 'Koşul sağlanmadı', alt: [gun, kosulOk ? limit : 'işlem yok', aralik, s.asama === 'giris' ? 'giriş penceresi açık (NY 02:00–04:00)' : 'giriş penceresi NY 02:00–04:00'].filter(Boolean).join(' · '), ton: kosulOk ? 'tone-primary' : '' };
    }
    if (s.durum === 'islem' && x) return { deger: `Bitti: ${rMetin(x.R)}`, alt: `${gun} · ${yonAdi(x.yon)} ${fiyat(x.giris)} → ${fiyat(x.cikis)}, ${NEDEN[x.neden] || x.neden} kapandı · gece kayda yazılır` };
    if (s.durum === 'dolmadi') return { deger: 'Limit dolmadı', alt: `${gun} · ${limit || 'limit'} — fiyat gelmedi, işlem yok` };
    if (s.durum === 'kosul-yok') {
      const neden = [s.kosul && !s.kosul.r ? `aralık geniş (${pip(s.r)}, sınır ${pip(0.45 * s.adr5)})` : '', s.kosul && !s.kosul.asya && sayiMi(s.aH) ? `Asya aralığı geniş (${pip(s.aH - s.aL)}, sınır ${pip(0.35 * s.adr5)})` : ''].filter(Boolean).join(', ');
      return { deger: 'Koşul sağlanmadı', alt: `${gun} · işlem yok${neden ? ` — ${neden}` : ''}` };
    }
    if (s.durum === 'yon-yok') return { deger: 'Yön yok', alt: `${gun} · önceki gün tam ortada kapandı, işlem yok` };
    if (s.durum === 'stop-dar') return { deger: 'Stop çok dar', alt: `${gun} · stop mesafesi maliyetin 3 katından küçük, işlem yok` };
    if (s.durum === 'veri-eksik') return { deger: 'Veri eksik', alt: `${gun} · ${(s.eksik || []).join(', ')}`, ton: 'tone-warning' };
    return { deger: '—', alt: gun };
  }

  /** EUR/USD — CBDR ile Londra girişi (PLAN-ILERI-CBDR). `c` = /api/ileri/cbdr yanıtı. */
  function cbdrModel(c) {
    if (!c || !c.success || !c.rapor) return { hata: `EUR/USD CBDR raporu alınamadı: ${(c && c.error) || 'sunucu bu sürümü henüz çalıştırmıyor olabilir'}` };
    const r = c.rapor, sc = c.sonCalisma, deg = (sc && sc.degisen) || [];
    const sira = cbdrSiradaki(c.siradaki);
    const son = r.son && r.son.islem;
    const sayac = r.sayac || {};
    const durum = deg.length ? { metin: 'Yeniden hesap farklı', ton: 'uyari' } : !sc ? { metin: 'İzleyici henüz çalışmadı', ton: 'uyari' } : { metin: 'Ölçüm sürüyor', ton: '' };
    const ozet = `Önceki günün New York 14:00–20:00 dar aralığı (CBDR) ölçülür; Londra açılışında fiyat bu aralığın bir boy dışına taşarsa limit emirle ters yönde girilir. Emir yok, yalnız kayıt. ${r.islem ? `${r.islem} işlem, ortalama ${rMetin(r.ortR)}` : 'Henüz işlem yok'}. Sıradaki gün: ${sira.deger.toLocaleLowerCase('tr-TR')}. Karar ${tarihAdi(r.kararTarihi)}.`;
    return {
      baslik: 'EUR/USD — CBDR ile Londra girişi',
      ozet,
      durum,
      ana: [0, 1, 2],
      sayilar: [
        { etiket: 'İşlem sayısı', deger: String(r.islem), alt: `${r.gun} iş günü kayıtlı · başlangıç ${r.baslangic}` },
        { etiket: 'Ortalama R', yardim: 'rBirimi', deger: rMetin(r.ortR), alt: r.islem ? `isabet %${Math.round(r.isabet * 100)} (kârla kapanan)` : 'ilk işlemle dolar', ton: sayiMi(r.ortR) ? (r.ortR > 0 ? 'tone-success' : r.ortR < 0 ? 'tone-danger' : '') : '' },
        { etiket: 'Sıradaki gün', yardim: 'cbdr', deger: sira.deger, alt: sira.alt, ton: sira.ton || '' },
        { etiket: 'Toplam R', yardim: 'rBirimi', deger: rMetin(r.toplamR), alt: r.islem ? `hedef ${r.hedef} · stop ${r.stop} · süre doldu ${r.zaman}` : '—' },
        { etiket: 'Son işlem', deger: son ? rMetin(son.R) : '—', alt: son ? `${tarihAdi(r.son.gun)} · ${yonAdi(son.yon)} ${fiyat(son.giris)} → ${fiyat(son.cikis)}, ${NEDEN[son.neden] || son.neden}` : 'henüz işlem yok' },
        { etiket: 'İşlemsiz günler', deger: String((sayac.dolmadi || 0) + (sayac['kosul-yok'] || 0) + (sayac['yon-yok'] || 0) + (sayac['stop-dar'] || 0)), alt: `limit dolmadı ${sayac.dolmadi || 0} · koşul yok ${sayac['kosul-yok'] || 0}${sayac['veri-eksik'] ? ` · veri eksik ${sayac['veri-eksik']}` : ''}` }
      ],
      hukumTarihi: r.kararTarihi,
      hukumAlt: [kalanMetin(r.kalanGun), `ara kontrol ${r.araKontrol}`, `${r.enAzIslem} işlem yoksa ${r.kararErteleme}`].filter(Boolean).join(' · '),
      not: [
        'Kural: önceki iş günü NY 14:00–20:00 gövde aralığı (CBDR) son 5 günün ortalama günlük aralığının %45’inden, Asya aralığı (20:00–24:00) %35’inden dar olmalı; önceki gün ortasının üstünde kapandıysa alış (aralık altı − 1 boy), altında kapandıysa satış (aralık üstü + 1 boy) limiti NY 02:00–04:00; stop ortalama günlük aralık × 0,33, hedef aralığın 2 boy ötesi, 11:00’de kapanır. Maliyet 0,5 pip/dolum + 0,2 pip kayma. Veri Binance EURUSDT 5 dk (EUR/USD’ye çok yakın).',
        'Karar ölçütü (önceden yazıldı, değişmez): ortalama R > 0 ve isabet ≥ %25 → izlemeye devam / küçük sermayeyle canlı adayı; ortalama R ≤ −0,10 → ret; arası → bir yıl daha. Ara kontrolde hüküm yok.',
        sc ? `Son çalışma ${AG.fmt ? AG.fmt.tarihSaat(sc.zaman) : sc.zaman} (${sc.satirSayisi} gün kayıtlı).` : 'Kayıt sunucunun ileri test işiyle her gün 00:15 UTC sonrası yazılır.',
        deg.length ? `UYARI: ${deg.length} kayıtlı günün yeniden hesabı farklı (ilk ${deg[0].gun}) — kayıt değişmedi, veri düzeltmesi incelenmeli.` : '',
        c.siradakiHata ? `Canlı veri alınamadı (${c.siradakiHata}); sıradaki gün son çalışmadan.` : ''
      ].filter(Boolean).join(' ')
    };
  }

  /**
   * 876 gölge — Hücum %90 + TVL L/S %10 (PLAN-ILERI-876, deneme 882). `g` = /api/ileri/876 yanıtı ({ ozet: son.json }).
   * Yalnız betimler: iki ay istatistiksel kanıt değildir; vazgeçme kuralı önceden yazıldı (hüküm değil, izleme kuralı).
   */
  function l876Model(g, bugun) {
    if (!g || !g.success) return { hata: `876 gölge özeti alınamadı: ${(g && g.error) || 'sunucu bu sürümü henüz çalıştırmıyor olabilir'}` };
    const o = g.ozet, t = (o && o.takvim) || g.takvim || {};
    const rapor = t.rapor || '2027-01-01';
    const gun = bugun || bugunStr();
    const kalan = Math.round((Date.parse(`${rapor}T00:00:00Z`) - Date.parse(`${gun}T00:00:00Z`)) / 864e5);
    const ilkKur = (t.kuruluslar || [])[0] || '2026-11-01';
    const kurAdi = (t.kuruluslar || ['2026-11-01', '2026-12-01']).map(tarihAdi).join(' ve ');
    const ozet = `Geçmiş testte yalnız en derin düşüş sınırını aştığı için elenen TVL long/short kuralı (876), emirsiz gölge olarak Kairos'la birlikte izlenir: Kairos %90 + 876 %10. Kuruluşlar ${kurAdi}; rapor ${tarihAdi(rapor)}. Para yok, emir yok. İki ay istatistiksel kanıt değildir.`;
    const ortak = { baslik: '876 gölge — Kairos %90 + TVL L/S %10', ozet, hukumTarihi: rapor, hukumEtiket: 'Rapor günü',
      hukumAlt: [kalan > 0 ? kalanMetin(kalan) : '', `kuruluşlar ${kurAdi}`].filter(Boolean).join(' · ') };
    if (!o) {
      return { ...ortak, durum: { metin: 'İzleyici henüz çalışmadı', ton: 'uyari' }, ana: [0, 1, 2], sayilar: [
        { etiket: 'Bu ayın sepeti', deger: '—', alt: `ilk kuruluş ${tarihAdi(ilkKur)}` },
        { etiket: 'Bu ay (876)', deger: '—', alt: 'ilk kuruluştan sonra dolar' },
        { etiket: 'Birlikte − Kairos', deger: '—', alt: 'ilk kuruluştan sonra dolar' }
      ], not: 'Kayıt sunucunun ileri test işiyle her gün 00:15 UTC sonrası yazılır. İki ay istatistiksel kanıt değildir.' };
    }
    const a = o.ay, b = o.birlesim, h = o.hucum, d = o.durdurma || {};
    const deg = o.degisen || [], eks = o.eksik || [];
    const durum = o.durum === 'rapor' ? { metin: 'Rapor yazıldı', ton: '' }
      : o.durum === 'durdu' ? { metin: 'Durduruldu (vazgeçme kuralı)', ton: 'uyari' }
        : deg.length ? { metin: 'Yeniden hesap farklı', ton: 'uyari' }
          : o.durum === 'bekliyor' ? { metin: 'İlk kuruluş bekleniyor', ton: '' } : { metin: 'Ölçüm sürüyor', ton: '' };
    const bVar = !!(b && b.gun && h);
    const fark = bVar ? b.getiri - h.getiri : null;
    const dur = d.dur;
    return {
      ...ortak, durum, ana: [0, 1, 2],
      sayilar: [
        { etiket: 'Bu ayın sepeti', deger: a ? (a.n ? `${a.long} long · ${a.short} short` : 'boş ay (nakit)') : '—',
          alt: a ? `${tarihAdi(a.F)} kuruluşu · ${a.N} coinde sinyal (evren ${a.evren})${a.gecikmeli ? ' · gecikmeli kuruldu' : ''}` : `ilk kuruluş ${tarihAdi(ilkKur)}` },
        { etiket: 'Bu ay (876)', deger: yuzde(o.mtd), alt: o.sonGun ? `${tarihAdi(o.sonGun)} kapanışı${o.sonGunKesin ? '' : ' · bugün kapatılsa (maliyet dahil)'}` : 'ilk işaretlemeyle dolar',
          ton: sayiMi(o.mtd) ? (o.mtd > 0 ? 'tone-success' : o.mtd < 0 ? 'tone-danger' : '') : '' },
        { etiket: 'Birlikte − Kairos', deger: puan(fark),
          alt: bVar ? `birlikte ${yuzde(b.getiri)} · yalnız Kairos ${yuzde(h.getiri)} · ${b.gun} gün` : (b && b.eksikHucum ? `Kairos simülasyon satırı bekleniyor (${b.eksikHucum})` : 'ilk işaretlemeyle dolar') },
        { etiket: 'Başlangıçtan beri (876)', deger: yuzde(o.toplam876), alt: `en derin düşüş ${yuzde(o.mdd876)} · başlangıç ${tarihAdi(t.bas || '2026-10-31')} kapanışı` },
        { etiket: 'En derin düşüş — birlikte / Kairos', deger: bVar ? `${yuzde(b.maxDD)} / ${yuzde(h.maxDD)}` : '—', alt: 'günlük kapanışla, aynı günler' },
        { etiket: 'Vazgeçme kuralı', deger: dur ? `tetiklendi (${dur.kural === 'D1' ? '876 düşüşü' : 'birlikte düşüşü'})` : 'tetiklenmedi', ton: dur ? 'tone-warning' : '',
          alt: `876 en derin düşüş ${yuzde(d.D1 && d.D1.deger)} (sınır −%20) · birlikte − Kairos düşüş farkı ${puan(d.D2 && d.D2.fark)} (sınır −3 puan)${dur ? ` · ${tarihAdi(dur.gun)}` : ''}` }
      ],
      not: [
        'Kural (değişmez, 95404dd): her ayın 1’inde Binance vadeli coinlerinden DefiLlama TVL’si son 30 günde en çok artanlar long, en çok azalanlar short; dolar ve BTC-beta nötr, ay boyu tutulur. Kairos tarafı sunucunun Kairos simülasyonu (model). Her gün %90 Kairos + %10 876 olarak birleştirilir.',
        'Vazgeçme (önceden yazıldı): 876’nın en derin düşüşü −%20’ye ulaşırsa ya da birlikte düşüş Kairos’un düşüşünden 3 puandan fazla kötüyse gölge durur ve rapor yazılır. 1 Ocak 2027’de uzatma ya da canlı hesap kararı sizindir. İki ay istatistiksel kanıt değildir.',
        o.zaman ? `Son çalışma ${AG.fmt ? AG.fmt.tarihSaat(o.zaman) : o.zaman}.` : '',
        eks.length ? `Eksik veri: ${eks.length} kalem (${eks.slice(0, 3).map(x => x.seri).join(', ')}) — sonraki çalışmada tamamlanır.` : '',
        deg.length ? `UYARI: ${deg.length} kayıtlı satırın yeniden hesabı farklı — kayıt değişmedi, incelenmeli.` : ''
      ].filter(Boolean).join(' ')
    };
  }

  /**
   * Saf: karar takvimi — bugün + bütün karar / kontrol günleri, tarihe göre. Aynı güne düşenler tek noktada.
   * → [{ tarih | null, etiket, bugun? }] (tarih null = "Gün 0 + 63" gibi henüz bilinmeyen; sona konur; geçmiş günler atlanır).
   */
  function takvimModel(v, k, bugun, c, g8) {
    const gun = bugun || bugunStr();
    const l = [];
    const ekle = (tarih, etiket) => { if (!tarih) { l.push({ tarih: null, etiket }); return; } const x = l.find(y => y.tarih === tarih); if (x) x.etiket += ` · ${etiket}`; else l.push({ tarih, etiket }); };
    const kontrol = (k && k.hucumDenge && k.hucumDenge.kontrol) || [];
    for (const n of kontrol) ekle(n.tarih, `Kairos/Tao ${n.gun}. gün ${n.gun === 365 ? 'kararı' : 'kontrolü'}`);
    const d = k && k.demo;
    if (d) { const f2 = (d.asamalar || []).find(a => a.hukum); ekle(f2 && f2.tarih ? f2.tarih : null, f2 && f2.tarih ? 'Demo kabul kararı (Gün 63)' : 'Demo kabul kararı — Gün 0 + 63 (bot başlayınca)'); }
    const r = v && v.rapor;
    if (r && r.sonrakiHukumTarihi) ekle(r.sonrakiHukumTarihi, 'Bollinger kararı');
    if (v && v.zamanDilimi && v.zamanDilimi.hukumTarihi) ekle(v.zamanDilimi.hukumTarihi, '3 günlük karar');
    if (v && v.rangeVeto && v.rangeVeto.hukumTarihi) ekle(v.rangeVeto.hukumTarihi, 'yatay piyasa filtresi');
    const cr = c && c.success && c.rapor;
    if (cr) { ekle(cr.araKontrol, 'EUR/USD CBDR ara kontrol'); ekle(cr.kararTarihi, 'EUR/USD CBDR kararı'); }
    if (g8 && g8.success) { const t8 = (g8.ozet && g8.ozet.takvim) || g8.takvim || {}; for (const f of t8.kuruluslar || []) ekle(f, '876 gölge kuruluşu'); ekle(t8.rapor, '876 gölge raporu'); }
    const tarihli = l.filter(x => x.tarih && x.tarih >= gun).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
    return [{ tarih: gun, etiket: `bugün${r && sayiMi(r.gecenGun) ? ` · ${r.gecenGun}. gün` : ''}`, bugun: true }, ...tarihli, ...l.filter(x => !x.tarih)];
  }

  /**
   * Saf: grafik tanımları — her test kendi grafiği. Seri yoksa `bos` metni.
   * → [{ kimlik, baslik, isik: 'iyi'|'uyari'|'tehlike'|'notr', durum, seriler: [{ ad, sinif, noktalar: [{ gun, v }] }], esikler: [{ ad, v, sinif }], alt, bos?, sifirli? }]
   */
  function grafikModeli(v, k, c) {
    const g = v && v.rapor && v.rapor.golge, m = g && g.model, seri = (g && g.seri) || [];
    const ddGrafik = (ad, kim) => {
      const x = m && m[ad];
      const isik = !x ? 'notr' : x.durum === 'DUR' ? 'tehlike' : x.durum === 'uyari' ? 'uyari' : 'iyi';
      return { kimlik: `ileriGrafik-${ad}`, baslik: `${kim} simülasyonu — en derin düşüş`, isik, durum: !x ? 'kayıt bekleniyor' : isik === 'iyi' ? 'eşiğin altında' : isik === 'uyari' ? 'uyarı eşiği aşıldı' : 'alarm eşiği aşıldı',
        seriler: [{ ad: kim, sinif: `ilg-${ad}`, noktalar: seri.map(s => ({ gun: s.gun, v: s[ad] })) }],
        esikler: x ? [{ ad: `uyarı ${yuzde(x.p95)}`, v: x.p95, sinif: 'ilg-uyari' }, { ad: `alarm ${yuzde(x.p99)}`, v: x.p99, sinif: 'ilg-alarm' }] : [],
        alt: x ? `${yuzde(x.maxdd)} · uyarı eşiği ${yuzde(x.p95)} · alarm eşiği ${yuzde(x.p99)} (${x.ufuk} g)` : 'simülasyon kaydı bekleniyor', bos: seri.length ? null : 'Simülasyon kaydı bekleniyor.' };
    };
    const b = v && v.rapor && v.rapor.btc, bs = (b && b.seri) || [];
    const z = v && v.zamanDilimi, zs = (z && !z.hata && z.seri) || [];
    const d3 = v && v.rangeVeto, ds = (d3 && !d3.hata && d3.seri) || [];
    const u = k && k.demo && k.demo.uygulama, us = (u && u.seri) || [], ue = u && u.esik;
    const demoVar = !!(k && k.demo && k.demo.veriVar);
    const cr = c && c.success && c.rapor, cs = (cr && cr.seri) || [];
    return [
      ddGrafik('hucum', 'Kairos'),
      ddGrafik('denge', 'Tao'),
      { kimlik: 'ileriGrafik-bollinger', baslik: 'Bollinger — BTC en derin düşüş', isik: 'notr', durum: 'ölçüm sürüyor',
        seriler: [{ ad: 'mevcut kural', sinif: 'ilg-c0', noktalar: bs.map(s => ({ gun: s.gun, v: s.C0 })) }, { ad: 'Bollinger’li kural', sinif: 'ilg-c1', noktalar: bs.map(s => ({ gun: s.gun, v: s.C1 })) }],
        esikler: [], alt: b && b.gun ? `mevcut ${yuzde(b.C0.maxdd)} · Bollinger’li ${yuzde(b.C1.maxdd)} · düşüş olayı ${v.rapor.dusus.sayi}` : 'BTC kaydı bekleniyor', bos: bs.length ? null : 'BTC kaydı bekleniyor.' },
      { kimlik: 'ileriGrafik-yan', baslik: 'Yan denemeler — günlüğe göre fark (Kairos)', isik: (z && z.A && z.A.durum === 'vazgeçildi') || (d3 && d3.durum === 'vazgeçildi') ? 'uyari' : 'notr', durum: 'ölçüm sürüyor', sifirli: true, puan: true,
        seriler: [{ ad: '3 günlük karar', sinif: 'ilg-uc', noktalar: zs.map(s => ({ gun: s.gun, v: s.fark })) }, { ad: 'yatay piyasa filtresi', sinif: 'ilg-d3', noktalar: ds.map(s => ({ gun: s.gun, v: s.fark })) }],
        esikler: [], alt: `3 günlük karar ${z && z.A ? puan(z.A.sumH) : '—'} · yatay piyasa filtresi ${d3 && sayiMi(d3.sumH) ? puan(d3.sumH) : '—'} (artı = günlükten iyi)`, bos: zs.length || ds.length ? null : 'Kayıt bekleniyor.' },
      { kimlik: 'ileriGrafik-demo', baslik: 'Demo kabul — uygulama sapması (30 g)', isik: !demoVar ? 'uyari' : u && u.sonBant === 'engel' ? 'tehlike' : u && u.sonBant === 'incele' ? 'uyari' : 'iyi', durum: !demoVar ? 'başlamadı' : (u && u.sonBant) || 'ölçüm sürüyor',
        seriler: [{ ad: 'sapma', sinif: 'ilg-demo', noktalar: us.map(s => ({ gun: s.gun, v: Math.abs(s.fark) })) }],
        esikler: ue ? [{ ad: `incele ${yuzde(ue.incele, 0)}`, v: ue.incele, sinif: 'ilg-uyari' }, { ad: `sınır ${yuzde(ue.engel, 0)}`, v: ue.engel, sinif: 'ilg-alarm' }] : [],
        alt: u && sayiMi(u.sonFark) ? `son sapma ${yuzde(u.sonFark, 2)}` : 'bot başlayınca dolar', bos: us.length ? null : (demoVar ? 'Sapma kaydı bekleniyor.' : 'Bot başlayınca dolar (Gün 0).') },
      { kimlik: 'ileriGrafik-cbdr', baslik: 'EUR/USD CBDR — birikimli R', isik: 'notr', durum: cr ? 'ölçüm sürüyor' : 'rapor yok', sifirli: true,
        seriler: [{ ad: 'birikimli R', sinif: 'ilg-cbdr', noktalar: cs.map(x => ({ gun: x.gun, v: x.birikim })) }],
        esikler: [], alt: cr && cr.islem ? `${cr.islem} işlem · toplam ${rMetin(cr.toplamR)} · ortalama ${rMetin(cr.ortR)}` : 'ilk işlemle dolar (başlangıç 2026-10-15)', bos: cs.length ? null : 'İlk işlem bekleniyor.' }
    ];
  }

  /* ── Çizim ───────────────────────────────────────────────────────────── */
  const ISIK = { iyi: 'borsa-isik-iyi', uyari: 'borsa-isik-uyari', tehlike: 'borsa-isik-tehlike', notr: 'borsa-isik-notr', '': 'borsa-isik-notr' };
  const ROZET = { iyi: 'bot-durum-iyi', uyari: 'bot-durum-uyari', tehlike: 'bot-durum-tehlike', '': '' };

  function takvimCiz(v, k, c, g8) {
    const kap = bul('ileriTakvim');
    if (!kap || !AG.dom) return;
    const { el, doldur } = AG.dom;
    const l = takvimModel(v, k, undefined, c, g8);
    doldur(kap, [el('div', { class: 'glass-panel panel-pad' }, [
      el('h3', { class: 'card-title mb-3', text: 'Karar takvimi' }),
      el('ol', { class: 'ileri-takvim' }, l.map(x => el('li', { class: x.bugun ? 'ileri-takvim-bugun' : null }, [
        el('strong', { class: 'sayi', text: x.tarih ? tarihAdi(x.tarih) : 'Gün 0 + 63' }),
        el('span', { class: 'hint hint-sm mb-0', text: x.etiket })
      ])))
    ])]);
  }

  /** Küçük çizgi grafik (SVG). Y ekseni 0'dan (ya da `sifirli` ise ±) en büyük değer / eşiğe; renk sınıftan. */
  function cizgiGrafik(t) {
    const S = AG.dom.svg;
    const G = 300, Y = 120, ust = 8, alt = 18, sol = 4;
    const tum = t.seriler.flatMap(s => s.noktalar.map(n => n.v)).filter(sayiMi);
    const esikMax = t.esikler.reduce((a, e) => Math.max(a, e.v), 0);
    const ymax = Math.max(esikMax, ...tum.map(Math.abs), t.puan ? 0.005 : 0.01) * 1.1;
    const ymin = t.sifirli ? -ymax : 0;
    const gunler = [...new Set(t.seriler.flatMap(s => s.noktalar.map(n => n.gun)))].sort();
    const xi = (g) => (gunler.length <= 1 ? G / 2 : sol + (gunler.indexOf(g) / (gunler.length - 1)) * (G - sol * 2));
    const yi = (x) => ust + (1 - (x - ymin) / (ymax - ymin)) * (Y - ust - alt);
    const parca = [S('line', { x1: 0, x2: G, y1: yi(0), y2: yi(0), class: 'ilg-eksen' })];
    for (const e of t.esikler) parca.push(S('line', { x1: 0, x2: G, y1: yi(e.v), y2: yi(e.v), class: `ilg-esik ${e.sinif}` }), S('text', { x: G - 2, y: yi(e.v) - 3, 'text-anchor': 'end', class: `ilg-etiket ${e.sinif}`, text: e.ad }));
    for (const s of t.seriler) {
      const n = s.noktalar.filter(p => sayiMi(p.v));
      if (!n.length) continue;
      if (n.length === 1) parca.push(S('circle', { cx: xi(n[0].gun), cy: yi(n[0].v), r: 3, class: `ilg-nokta ${s.sinif}` }));
      else parca.push(S('polyline', { points: n.map(p => `${xi(p.gun).toFixed(1)},${yi(p.v).toFixed(1)}`).join(' '), class: `ilg-cizgi ${s.sinif}` }));
    }
    if (gunler.length) {
      parca.push(S('text', { x: sol, y: Y - 4, class: 'ilg-etiket', text: gunler[0].slice(5) }));
      if (gunler.length > 1) parca.push(S('text', { x: G - sol, y: Y - 4, 'text-anchor': 'end', class: 'ilg-etiket', text: gunler[gunler.length - 1].slice(5) }));
    }
    const ozet = t.seriler.map(s => `${s.ad}: ${s.noktalar.length} gün`).join('; ');
    return S('svg', { viewBox: `0 0 ${G} ${Y}`, class: 'ilg-svg', role: 'img', 'aria-label': `${t.baslik}. ${ozet}` }, parca);
  }

  /** Yeni panel F5: her grafik kendi testinin alt sayfasında (index.html #ileriG-<sayfa>); demo kabul Botlar › Hücum › Yönetim'de. */
  const GRAFIK_YERI = { 'ileriGrafik-hucum': 'ileriG-hucum-denge', 'ileriGrafik-denge': 'ileriG-hucum-denge', 'ileriGrafik-yan': 'ileriG-hucum-denge',
    'ileriGrafik-bollinger': 'ileriG-bollinger', 'ileriGrafik-demo': 'ileriG-demo', 'ileriGrafik-cbdr': 'ileriG-cbdr' };
  function grafiklerCiz(v, k, c) {
    if (!AG.dom) return;
    const { el, doldur } = AG.dom;
    const l = grafikModeli(v, k, c);
    const gruplar = new Map();
    for (const t of l) { const yer = GRAFIK_YERI[t.kimlik] || 'ileriGrafikler'; if (!gruplar.has(yer)) gruplar.set(yer, []); gruplar.get(yer).push(t); }
    for (const [yer, ts] of gruplar) {
      const kap = bul(yer);
      if (!kap) continue;
      doldur(kap, ts.map(t => el('div', { class: 'ileri-grafik glass-panel panel-pad', id: t.kimlik }, [
        el('div', { class: 'row-between gap-2' }, [el('strong', { text: t.baslik }), el('span', { class: 'ileri-grafik-durum hint-sm' }, [el('span', { class: `borsa-isik ${ISIK[t.isik] || ISIK.notr}`, 'aria-hidden': 'true' }), el('span', { text: ` ${t.durum}` })])]),
        t.bos ? el('p', { class: 'hint hint-sm mb-0 ileri-grafik-bos', text: t.bos }) : cizgiGrafik(t),
        t.seriler.length > 1 ? el('div', { class: 'ilg-lejant' }, t.seriler.map(s => el('span', { class: s.sinif, text: s.ad }))) : null,
        el('span', { class: 'hint hint-sm mb-0', text: t.alt })
      ])));
    }
  }

  /** F5 Genel bakış: beş testin durum tablosu (test · durum · karar günü → alt sayfa). Demo kabul Botlar › Hücum › Yönetim'e götürür. */
  const SAYFA = [['bollinger', 'Bollinger düşüş azaltıcı', 'ileri/bollinger'], ['hucumDenge', 'Kairos / Tao simülasyonu', 'ileri/hucum-denge'],
    ['demo', 'Demo kabul süreci', 'botlar/hucum/yonetim'], ['cbdr', 'EUR/USD CBDR', 'ileri/cbdr'], ['l876', '876 gölge', 'ileri/876']];
  function durumCiz(modeller) {
    const kap = bul('ileriDurum');
    if (!kap || !AG.dom) return;
    const { el, doldur } = AG.dom;
    doldur(kap, [el('div', { class: 'glass-panel panel-pad' }, [
      el('h3', { class: 'card-title mb-3', text: 'Testler' }),
      AG.tablo.kutulu({ sinif: 'table-dense pf-tablo', basliklar: ['Test', 'Durum', 'Karar günü'], satirlar: SAYFA.map(([k, ad, yol]) => {
        const m = modeller[k];
        return el('tr', null, [
          el('td', null, [el('a', { href: `#/${yol}`, class: 'no-underline fw-semibold', text: ad })]),
          el('td', null, m && !m.hata ? [el('span', { class: `bot-durum-buyuk ${ROZET[m.durum.ton] || ''}`.trim() }, [el('span', { class: 'bot-durum-isik', 'aria-hidden': 'true' }), el('span', { text: m.durum.metin })])] : [el('span', { class: 'hint hint-sm mb-0', text: (m && m.hata) || 'yükleniyor' })]),
          el('td', { class: 'sayi', text: m && !m.hata ? m.hukumTarihi : '—' })
        ]);
      }) })
    ])]);
  }

  /** 64.4 Demo kabul raporu bölümü: aşama satırı, §8.2 / prova durumu, ölçüt tablosu (ölçüt · değer · durum · not). */
  const CHIP = { iyi: 'pf-rozet-iyi', uyari: 'pf-rozet-uyari', tehlike: 'pf-rozet-tehlike', '': '' };
  function raporBolumu(rm) {
    const { el } = AG.dom;
    if (rm.hata) return el('div', { class: 'dk-rapor mt-3' }, [el('p', { class: 'hint hint-sm mb-0', text: rm.hata })]);
    return el('div', { class: 'dk-rapor mt-3', id: 'ileriDemoRapor' }, [
      el('div', { class: 'row-between row-wrap gap-2' }, [
        el('h4', { class: 'dk-rapor-baslik m-0', text: 'Kabul raporu' }),
        el('span', { class: 'dk-rapor-genel', text: rm.genel })
      ]),
      el('p', { class: 'dk-rapor-asama' }, [el('strong', { class: 'sayi', text: rm.asama }), el('span', { class: 'dk-kilometre', text: rm.kilometre })]),
      el('ul', { class: 'dk-bilgi' }, [el('li', { text: rm.kayit }), el('li', { text: rm.prova })]),
      // Panelin tek tablo bileşeni (AG.tablo.kur): masaüstünde kompakt tablo, telefonda/tablette satır başına kart.
      rm.bos ? el('p', { class: 'dk-rapor-bos mb-0', text: rm.bos }) : AG.tablo.kur({ sinif: 'dk-tablo', basliklar: ['Ölçüt', 'Değer', 'Durum'],
        satirlar: rm.satirlar.map(s => el('tr', null, [
          el('td', null, [el('span', { class: 'dk-kod', text: s.kod }), el('span', { text: ` ${s.ad}` }), s.not ? el('span', { class: 'dk-not', text: s.not }) : null,
            s.bilgi ? el('span', { class: 'dk-not', text: s.bilgi }) : null,
            s.ayrinti && s.ayrinti.length ? el('details', { class: 'hs-kat-mini mt-1' }, [
              el('summary', { text: `Ayrıntı (${s.ayrinti.length.toLocaleString('tr-TR')})` }),
              el('ul', { class: 'dk-bilgi' }, s.ayrinti.map(t => el('li', { text: t })))
            ]) : null]),
          el('td', { class: 'dk-sag sayi', text: s.deger }),
          el('td', null, [el('span', { class: `pf-rozet ${CHIP[s.ton] || ''}`.trim(), text: s.etiket })])
        ])) })
    ]);
  }

  function kartCiz(kapId, m) {
    const kap = bul(kapId);
    if (!kap || !AG.dom) return;
    const { el, doldur } = AG.dom;
    if (!m || m.hata) {
      doldur(kap, [el('div', { class: 'glass-panel panel-pad ileri-kart' }, [el('p', { class: 'hint mb-0', text: (m && m.hata) || 'Yükleniyor…' })])]);
      return;
    }
    const yardim = (k) => (k && AG.sozluk ? AG.sozluk.yardim(k) : null);
    const kutu = (s) => el('div', { class: 'ana-sayi' }, [
      el('span', { class: 'stat-title' }, [el('span', { text: s.etiket }), yardim(s.yardim)]),
      el('span', { class: `stat-value stat-value-sm sayi ${s.ton || ''}`.trim(), text: s.deger }),
      s.alt ? el('span', { class: 'hint hint-sm mb-0', text: s.alt }) : null
    ]);
    const anaI = m.ana || [];
    const ana = anaI.map(i => m.sayilar[i]).filter(Boolean);
    const diger = m.sayilar.filter((s, i) => !anaI.includes(i));
    doldur(kap, [el('div', { class: 'glass-panel panel-pad ileri-kart' }, [
      el('div', { class: 'row-between row-wrap gap-2 mb-2' }, [
        el('h3', { class: 'card-title m-0', text: m.baslik }),
        el('span', { class: `bot-durum-buyuk ${ROZET[m.durum.ton] || ''}`.trim() }, [el('span', { class: 'bot-durum-isik', 'aria-hidden': 'true' }), el('span', { text: m.durum.metin })])
      ]),
      m.ozet ? el('p', { class: 'ileri-ozet mb-3', text: m.ozet }) : null,
      m.eylem ? el('a', { class: 'btn btn-secondary btn-sm no-underline mb-3', href: m.eylem.href, text: m.eylem.metin }) : null,
      el('div', { class: 'ana-sayilar mb-3' }, ana.map(kutu)),
      el('div', { class: 'ileri-hukum' }, [
        el('span', { class: 'stat-title ileri-hukum-baslik' }, [el('span', { text: m.hukumEtiket || 'Karar günü' }), yardim('hukumTarihi')]),
        el('strong', { class: 'sayi', text: m.hukumTarihi }),
        m.hukumAlt ? el('span', { class: 'hint hint-sm mb-0', text: m.hukumAlt }) : null
      ]),
      m.rapor ? raporBolumu(m.rapor) : null,
      el('details', { class: 'hs-kat-mini mt-3' }, [
        el('summary', { text: `Ayrıntı${diger.length ? ` — ${diger.map(s => s.etiket).join(', ')}` : ''}` }),
        diger.length ? el('div', { class: 'ana-sayilar mt-2 mb-2' }, diger.map(kutu)) : null,
        el('p', { class: 'hint hint-sm mb-0', text: m.not })
      ])
    ])]);
  }

  function ciz(v, k, c, rr, g8) {
    takvimCiz(v, k, c, g8);
    grafiklerCiz(v, k, c);
    const m = { bollinger: bollingerModel(v), hucumDenge: v && v.success ? hucumDengeModel(v, k) : { hata: 'Simülasyon raporu alınamadı.' },
      demo: demoModel(k, rr), cbdr: cbdrModel(c), l876: l876Model(g8) };
    kartCiz('btIleriBollinger', m.bollinger);
    kartCiz('ileriHucumDenge', m.hucumDenge);
    kartCiz('ileriDemoKabul', m.demo);
    kartCiz('ileriCbdr', m.cbdr);
    kartCiz('ileri876', m.l876);
    durumCiz(m);
  }

  async function yukle(zorla) {
    if (!bul('btIleriBollinger')) return;
    if (!zorla && Date.now() - zaman < 60000) return;
    zaman = Date.now();
    const hataYaniti = (e) => ({ success: false, error: e.message });
    const [v, k, c, rr, g8] = await Promise.all([
      AG.api.ileriBollinger().catch(hataYaniti),
      AG.api.ileriKabul ? AG.api.ileriKabul().catch(hataYaniti) : Promise.resolve(null),
      AG.api.ileriCbdr ? AG.api.ileriCbdr().catch(hataYaniti) : Promise.resolve(null),
      AG.api.ileriKabulRapor ? AG.api.ileriKabulRapor().catch(hataYaniti) : Promise.resolve(null),
      AG.api.ileri876 ? AG.api.ileri876().catch(hataYaniti) : Promise.resolve(null)
    ]);
    ciz(v, k, c, rr, g8);
  }

  AG.pages = AG.pages || {};
  AG.pages.ileri = { yukle, ciz, durumCiz, GRAFIK_YERI, bollingerModel, hucumDengeModel, demoModel, demoRaporModel, OLCUT_ADI, ucGunSatiri, d3Satiri, hucumSSatiri, takvimModel, grafikModeli, tarihAdi, cbdrModel, cbdrSiradaki, l876Model };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.ileri;
})(typeof window !== 'undefined' ? window : globalThis);
