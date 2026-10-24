/**
 * PİYASA BAĞLAMI — #/piyasa `AG.pages.piyasaBaglami` (73.9 D7 + WinC panosu; kullanıcı kararı 2026-10-24, taslaklar EP3T4695 / WxzMZfc1)
 * ═══════════════════════════════════════════════════════════════════════════
 * "Karar kuralı yok · bilgi": olay takvimi, protokol kartı, makro pano, opsiyon, pozisyonlanma, akış, duygu/genişlik. Hiçbir
 * gösterge bot kararına girmez; sayfa yalnız okur (GET /api/piyasa-baglami — lib/piyasaBaglami; araştırma kopyasında sunucudan).
 * Ana sayfa "Bu hafta" kartı (#anaBuHafta — GET /api/piyasa-baglami/hafta) da buradan çizilir.
 * Her kart: durum (iyi / bayat / veri yok + neden), kaynak · sıklık · veri zamanı, sınandıysa "deneme N" notu. Bayat kartın
 * değerleri soluk ve "bayat — son veri …" etiketiyle; veri yoksa yalnız neden. Grafik: küçük SVG çizgi (AG.dom.svg).
 * DOM yalnız AG.dom; sunucu metni metin olarak yazılır (HTML yorumlanmaz).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);

  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const tr = (x, b = 1) => x.toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
  const yuzde = (x, b = 1) => (sayiMi(x) ? `${x < 0 ? '−' : ''}%${tr(Math.abs(x) * 100, b)}` : '—');
  const isaretliYuzde = (x, b = 1) => (sayiMi(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}%${tr(Math.abs(x) * 100, b)}` : '—');
  const puan = (x, b = 2) => (sayiMi(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${tr(Math.abs(x), b)} puan` : '—');
  const sayi = (x, b = 2) => (sayiMi(x) ? `${x < 0 ? '−' : ''}${tr(Math.abs(x), b)}` : '—');
  const tam = (x) => (sayiMi(x) ? `${x < 0 ? '−' : ''}${Math.round(Math.abs(x)).toLocaleString('tr-TR')}` : '—');
  /** USD büyüklük: 1,23 trilyon $ · 302,8 milyar $ · 11,1 milyon $ · 980 bin $. */
  function usd(x, isaretli = false) {
    if (!sayiMi(x)) return '—';
    const a = Math.abs(x), s = x < 0 ? '−' : isaretli && x > 0 ? '+' : '';
    if (a >= 1e12) return `${s}${tr(a / 1e12, 2)} trilyon $`;
    if (a >= 1e9) return `${s}${tr(a / 1e9, 1)} milyar $`;
    if (a >= 1e6) return `${s}${tr(a / 1e6, 1)} milyon $`;
    if (a >= 1e3) return `${s}${tr(a / 1e3, 0)} bin $`;
    return `${s}${tr(a, 0)} $`;
  }
  const fiyat = (x) => (sayiMi(x) ? (x >= 1000 ? tam(x) : sayi(x, x >= 1 ? 2 : 5)) : '—');
  const gunAdi = (g) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(g || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : '—'; };
  function zamanMetni(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const ayAdi = (ay) => { const m = /^(\d{4})-(\d{2})$/.exec(ay || ''); return m ? `${AY[+m[2] - 1]} ${m[1]}` : '—'; };

  const GRUPLAR = [
    { kimlik: 'takvim', ad: 'Olay takvimi', aciklama: 'Önümüzdeki 3 hafta: FOMC, TÜFE (Türkiye, ABD), BIST bilanço son günleri, elle eklenen kilit açılımları; geçen 2 haftanın açıklanan sonuçları.' },
    { kimlik: 'makro', ad: 'Makro pano', aciklama: 'Likidite, faiz, dolar, enflasyon, stablecoin, MVRV, kredi spreadi ve COT.' },
    { kimlik: 'opsiyon', ad: 'Opsiyon', aciklama: 'OKX + Bybit + Binance opsiyon zinciri (sunucunun ileriye kaydı): gamma maruziyeti, max pain, örtük oynaklık, 25Δ çarpıklık, put/call.' },
    { kimlik: 'pozisyon', ad: 'Pozisyonlanma', aciklama: 'Funding, açık pozisyon, büyük hesapların long/short oranı, Hyperliquid büyük hesaplar.' },
    { kimlik: 'akis', ad: 'Akış', aciklama: 'Taker al/sat ve CVD, Coinbase primi, vadeli baz.' },
    { kimlik: 'duygu', ad: 'Duygu ve genişlik', aciklama: 'Korku-açgözlülük, alt sezonu, RSI haritası.' },
    { kimlik: 'protokol', ad: 'Protokol kartı', aciklama: 'DefiLlama: son 30 günün ücreti en yüksek protokoller — gelir, TVL, piyasa değeri, P/F ve P/S.' },
  ];

  /* ── Saf: kart → gösterim modeli (öz test) ───────────────────────────────── */
  const S = (e, d, ton) => ({ e, d, ton: ton || null });

  /** @returns {{ satirlar: [{e,d,ton}], seri: [[x, v]] | null, tablo: { basliklar, satirlar: [[...]] } | null, liste: [{ metin, alt, ton }] | null, notlar: [] }} */
  function kartModeli(k) {
    const v = k && k.deger;
    const m = { satirlar: [], seri: null, tablo: null, liste: null, notlar: [] };
    if (!v) return m;
    switch (k.kimlik) {
      case 'takvim':
        m.liste = (v.gelecek || []).map(o => ({ metin: o.metin, alt: [o.ayrinti, o.kaynak].filter(Boolean).join(' · '), ton: o.gecti ? 'soluk' : o.tur === 'fomc' || /^tufe/.test(o.tur) ? 'vurgu' : null }));
        if (!m.liste.length) m.liste = [{ metin: 'Önümüzdeki 3 haftada takvimde olay yok.', alt: '', ton: 'soluk' }];
        for (const o of v.gecmis || []) m.satirlar.push(S(o.metin, o.sonucMetin || 'sonuç henüz alınmadı', o.sonucMetin ? null : 'soluk'));
        m.notlar = v.notlar || [];
        break;
      case 'protokol':
        m.tablo = { basliklar: ['Protokol', 'Kategori', 'Ücret 30 g', 'Gelir 30 g', 'TVL', 'Piyasa değeri', 'P/F', 'P/S'],
          satirlar: (v.tablo || []).map(p => [p.ad, p.kategori || '—', usd(p.ucret30), usd(p.gelir30), usd(p.tvl), usd(p.mcap), sayiMi(p.pf) ? `${tr(p.pf, 1)}×` : '—', sayiMi(p.ps) ? `${tr(p.ps, 1)}×` : '—']) };
        m.notlar = [`Arşiv günü ${gunAdi(v.gun)}${v.deneme ? ' (deneme arşivi)' : ''}. P/F = piyasa değeri / yıllıklaştırılmış 30 günlük ücret; P/S = gelirle aynı. Piyasa değeri DefiLlama\'da yoksa —.`];
        break;
      case 'netLikidite':
        m.satirlar = [S('Son (çarşamba)', `${usd(v.son.v * 1e6)} · ${gunAdi(v.son.d)}`), S('4 haftada', usd(v.d4 * 1e6, true)), S('13 haftada', usd(v.d13 * 1e6, true)), S('52 haftada', usd(v.d52 * 1e6, true))];
        m.seri = v.seri; m.notlar = ['WALCL − WTREGEN − 1000 × RRPONTSYD (milyon $ → gösterim $).'];
        break;
      case 'faiz':
        m.satirlar = [S('13 haftalık bono (^IRX)', v.irx ? `%${tr(v.irx.v, 2)} · ${gunAdi(v.irx.d)}` : '—'), S('3 ayda', v.irx ? puan(v.irx.d91) : '—'), S('1 yılda', v.irx ? puan(v.irx.d365) : '—'),
          S('Fed politika faizi', v.politika ? `%${tr(v.politika.alt, 2)}–${tr(v.politika.ust, 2)} · ${gunAdi(v.politika.d)}` : '—')];
        m.seri = v.seri;
        break;
      case 'dxy':
        m.satirlar = [S('Sentetik DXY', `${sayi(v.v, 2)} · ${gunAdi(v.d)}`), S('1 ayda', isaretliYuzde(v.d30)), S('1 yılda', isaretliYuzde(v.d365))];
        m.seri = v.seri; m.notlar = ['ICE formülü: 50,14 × EURUSD^−0,576 × USDJPY^0,136 × GBPUSD^−0,119 × USDCAD^0,091 × USDSEK^0,042 × USDCHF^0,036.'];
        break;
      case 'usdtry':
        m.satirlar = [S('USD/TRY', `${sayi(v.v, 2)} · ${gunAdi(v.d)}`), S('1 ayda', isaretliYuzde(v.d30)), S('1 yılda', isaretliYuzde(v.d365))];
        m.seri = v.seri;
        break;
      case 'tufe':
        for (const [ad, x] of [['ABD', v.abd], ['Türkiye', v.tr]]) m.satirlar.push(S(`${ad} (${x ? ayAdi(x.ay) : '—'})`, x ? `aylık ${isaretliYuzde(x.aylik)} · yıllık ${isaretliYuzde(x.yillik)}` : 'veri yok'));
        break;
      case 'stablecoin':
        m.satirlar = [S('Toplam arz', `${usd(v.v)} · ${gunAdi(v.d)}`), S('30 günde', isaretliYuzde(v.d30)), S('3 ayda', isaretliYuzde(v.d91)), S('1 yılda', isaretliYuzde(v.d365))];
        m.seri = v.seri;
        break;
      case 'mvrv':
        m.satirlar = [S('BTC MVRV', `${sayi(v.v, 2)} · ${gunAdi(v.d)}`), S('30 günde', puan(v.d30)), S('Son 1 yılın aralığı', v.yil ? `${sayi(v.yil.enDusuk, 2)} – ${sayi(v.yil.enYuksek, 2)}` : '—')];
        m.seri = v.seri;
        break;
      case 'kredi':
        m.satirlar = [S("Baa − 10 yıl", `${sayi(v.v, 2)} puan · ${gunAdi(v.d)}`), S('3 ayda', puan(v.d91)), S('1 yılda', puan(v.d365))];
        m.seri = v.seri;
        break;
      case 'cot-btc': case 'cot-nq':
        m.satirlar = [S('Rapor (salı)', gunAdi(v.d)), S('Kaldıraçlı fon net', `${tam(v.levNet)} kontrat (OI'nin ${yuzde(v.levNetOi)})`), S('Haftalık değişim', sayiMi(v.levNetDegisim) ? `${v.levNetDegisim > 0 ? '+' : ''}${tam(v.levNetDegisim)} kontrat` : '—'),
          S('COT endeksi (52 rapor)', sayiMi(v.endeks) ? `${tr(v.endeks * 100, 0)} / 100` : 'en az 26 rapor gerekir'), S('Varlık yöneticisi net', sayiMi(v.varlikNet) ? `${tam(v.varlikNet)} kontrat` : '—')];
        m.seri = v.seri;
        m.notlar = ['Endeks: kaldıraçlı fon net / OI\'nin son 52 rapordaki yeri (0 = en düşük, 100 = en yüksek). CME Bitcoin\'de 2024 sonrası short tarafın büyük kısmı baz işlemidir (ETF long + vadeli short).'];
        break;
      case 'opsiyon-BTC': case 'opsiyon-ETH': {
        const g = v.gex || {};
        m.satirlar = [S('Spot (vadeli medyanı / endeks)', fiyat(v.S)),
          S('GEX (gamma maruziyeti, %1 hareket)', sayiMi(g.toplam) ? `${usd(g.toplam, true)} (alım ${usd(g.alim, true)}, satım ${usd(g.satim, true)})` : '—', sayiMi(g.toplam) ? (g.toplam >= 0 ? 'iyi' : 'uyari') : null)];
        for (const mp of v.maxPain || []) m.satirlar.push(S(`Max pain · ${gunAdi(mp.vade)}${mp.enBuyukOi ? ' (en büyük OI)' : ''}`, `${fiyat(mp.strike)} · OI ${tam(mp.oi)} ${k.kimlik.slice(-3)}`));
        const iv = v.iv;
        m.satirlar.push(S(`ATM IV · ${iv ? `${gunAdi(iv.vade)} (${iv.gun} g, ${iv.kaynak})` : '—'}`, iv && sayiMi(iv.atm) ? yuzde(iv.atm) : '—'));
        m.satirlar.push(S('25Δ çarpıklık (satım − alım)', iv && sayiMi(iv.carpiklik) ? `${puan(iv.carpiklik * 100, 1)} (satım ${yuzde(iv.satim25)}, alım ${yuzde(iv.alim25)})` : '—'));
        const sira = (x) => (!x ? '—' : x.yeterli ? `${tr(x.sira * 100, 0)} / 100` : `veri birikiyor: ${x.n} gün (1 yıl = 365)`);
        m.satirlar.push(S('IV sırası (1 yıl)', sira(v.ivSira), v.ivSira && !v.ivSira.yeterli ? 'soluk' : null));
        m.satirlar.push(S('Çarpıklık sırası (1 yıl)', sira(v.skewSira), v.skewSira && !v.skewSira.yeterli ? 'soluk' : null));
        m.satirlar.push(S('Put / call (açık pozisyon)', sayiMi(v.putCall) ? sayi(v.putCall, 2) : '—'));
        m.satirlar.push(S('Açık pozisyon (borsa)', Object.entries(v.kaynaklar || {}).map(([b, x]) => `${b} ${tam(x.oi)}`).join(' · ') || '—'));
        if (g.kullanim && g.kullanim.length) m.tablo = { basliklar: ['Kullanım fiyatı', 'GEX (%1)'], satirlar: g.kullanim.slice(0, 6).map(x => [fiyat(x.strike), usd(x.gex, true)]) };
        m.notlar = ['GEX işareti varsayımdır: piyasa yapıcı alımda uzun, satımda kısa gamma (müşteri alım satar, satım alır). Greek\'ler tek Black-Scholes formülüyle hesaplanır.'];
        break;
      }
      case 'funding': {
        const f = (x) => (x ? `${isaretliYuzde(x.oran, 4)} / 8 sa (yıllık ${isaretliYuzde(x.yillik, 1)})` : '—');
        m.satirlar = [S('BTC', f(v.BTC)), S('ETH', f(v.ETH)), S('Piyasa medyanı', isaretliYuzde(v.medyan, 4)), S('Artı funding olan perp', `${yuzde(v.artiPay, 0)} (${tam(v.sembol)} sembol)`),
          S('En yüksek', (v.enYuksek || []).map(x => `${x.s.replace(/USDT$/, '')} ${isaretliYuzde(x.oran, 3)}`).join(', ') || '—'), S('En düşük', (v.enDusuk || []).map(x => `${x.s.replace(/USDT$/, '')} ${isaretliYuzde(x.oran, 3)}`).join(', ') || '—')];
        break;
      }
      case 'oi':
        for (const c of ['BTC', 'ETH']) {
          const x = v[c];
          if (!x) { m.satirlar.push(S(c, 'veri yok', 'soluk')); continue; }
          const z = x.oi && sayiMi(x.oi.z30) ? sayi(x.oi.z30, 2) : `veri birikiyor: ${x.gunKapsam || 0} gün (en az 7)`;
          m.satirlar.push(S(`${c} açık pozisyon`, x.oi ? `${usd(x.oi.usd)} · 24 sa ${isaretliYuzde(x.oi.d24)} · 7 g ${isaretliYuzde(x.oi.d7)}` : '—'));
          m.satirlar.push(S(`${c} OI z-skoru (30 g, saatlik)`, z));
          m.satirlar.push(S(`${c} büyük hesap L/S (pozisyon)`, x.ustPozisyon ? `${sayi(x.ustPozisyon.oran, 2)} (7 g ort. ${sayi(x.ustPozisyon.ort7, 2)})` : '—'));
          m.satirlar.push(S(`${c} tüm hesaplar L/S`, x.genelHesap ? sayi(x.genelHesap.oran, 2) : '—'));
        }
        break;
      case 'hyperliquid':
        m.satirlar = [S('Hesap', `${tam(v.hesap)} · toplam değer ${usd(v.hesapDegeri)}`), S('Toplam long / short', `${usd(v.uzun)} / ${usd(v.kisa)}`), S('Net', usd(v.net, true), v.net >= 0 ? 'iyi' : 'uyari')];
        m.tablo = { basliklar: ['Coin', 'Long', 'Short', 'Net', 'Hesap (L / S)'], satirlar: (v.coinler || []).map(c => [c.coin, usd(c.uzun), usd(c.kisa), usd(c.net, true), `${c.uzunHesap} / ${c.kisaHesap}`]) };
        break;
      case 'cvd':
        for (const c of ['BTC', 'ETH']) {
          const x = v[c];
          if (!x || !x.taker) { m.satirlar.push(S(c, 'veri yok', 'soluk')); continue; }
          const t24 = x.taker.s24, t7 = x.taker.g7;
          m.satirlar.push(S(`${c} taker al/sat (24 sa · 7 g)`, `${t24 ? sayi(t24.oran, 3) : '—'} · ${t7 ? sayi(t7.oran, 3) : '—'}`));
          m.satirlar.push(S(`${c} CVD (24 sa · 7 g)`, `${t24 ? `${tam(t24.cvd)} ${c}` : '—'} · ${t7 ? `${tam(t7.cvd)} ${c}` : '—'}${sayiMi(x.fiyat) && t7 ? ` (≈ ${usd(t7.cvd * x.fiyat, true)})` : ''}`));
        }
        m.seri = v.BTC && v.BTC.cvdSeri && v.BTC.cvdSeri.length ? v.BTC.cvdSeri : null;
        if (m.seri) m.notlar = ['Çizgi: BTC CVD, son 7 gün (saatlik birikimli).'];
        break;
      case 'coinbase-primi':
        m.satirlar = [S('Son saat', isaretliYuzde(v.son, 3)), S('24 sa ortalama', isaretliYuzde(v.s24, 3)), S('7 g ortalama', isaretliYuzde(v.g7, 3))];
        m.seri = v.seri; m.notlar = ['Coinbase BTC-USD / (Binance BTCUSDT × Coinbase USDT-USD) − 1.'];
        break;
      case 'baz':
        for (const c of ['BTC', 'ETH']) { const x = v[c]; m.satirlar.push(S(`${c} çeyreklik baz (yıllık)`, x ? `${isaretliYuzde(x.yillik, 2)} (7 g ort. ${isaretliYuzde(x.ort7, 2)})` : '—')); }
        if (v.perp) for (const c of ['BTC', 'ETH']) { const x = v.perp[c]; m.satirlar.push(S(`${c} perp primi (mark / endeks)`, x && sayiMi(x.prim) ? isaretliYuzde(x.prim, 3) : '—')); }
        break;
      case 'korku':
        m.satirlar = [S('Bugün', `${tam(v.v)} — ${v.bolge || v.sinif || '—'} · ${gunAdi(v.d)}`, v.v <= 24 ? 'uyari' : v.v >= 75 ? 'uyari' : null), S('7 g ortalama', sayi(v.ort7, 0)), S('30 g ortalama', sayi(v.ort30, 0))];
        m.seri = v.seri;
        break;
      case 'alt-sezonu':
        m.satirlar = [S('Endeks', `${tr(v.endeks, 0)} / 100${v.endeks >= 75 ? ' — alt sezonu' : v.endeks <= 25 ? ' — BTC sezonu' : ''}`, v.endeks >= 75 || v.endeks <= 25 ? 'vurgu' : null),
          S('Evren', `${tam(v.evren)} altcoin (30 g dolar hacmi, BTC hariç)`), S('BTC 90 gün', isaretliYuzde(v.btc90)),
          S('En iyi 3', (v.enIyi || []).map(x => `${x.s} ${isaretliYuzde(x.g, 0)}`).join(', ')), S('En kötü 3', (v.enKotu || []).map(x => `${x.s} ${isaretliYuzde(x.g, 0)}`).join(', '))];
        m.notlar = ['90 günlük getirisi BTC\'ninkini geçen altcoin oranı. ≥ 75 alt sezonu, ≤ 25 BTC sezonu (Blockchaincenter eşikleri).'];
        break;
      case 'rsi':
        m.satirlar = [S('BTC RSI (14 g)', sayi(v.btc, 0), sayiMi(v.btc) && (v.btc >= 70 || v.btc <= 30) ? 'uyari' : null)];
        m.liste = (v.coinler || []).map(c => ({ metin: `${c.s} ${tr(c.r, 0)}`, alt: '', ton: c.r >= 70 ? 'sicak' : c.r <= 30 ? 'soguk' : null }));
        m.notlar = ['RSI ≥ 70 sıcak (kırmızımsı), ≤ 30 soğuk (mavimsi); sıralama yüksekten düşüğe.'];
        break;
      default: break;
    }
    return m;
  }

  /** Saf: kart durum satırı. */
  function durumMetni(k) {
    if (!k) return '';
    if (k.durum === 'yok') return `veri yok — ${k.neden || 'neden bilinmiyor'}`;
    if (k.durum === 'bayat') return `bayat — son veri ${zamanMetni(k.veriZamani)} — ${k.neden || ''}`;
    return '';
  }

  /** Saf: kartları gruplara ayırır (GRUPLAR sırası; bilinmeyen grup sonda). */
  function grupla(kartlar) {
    const m = new Map(GRUPLAR.map(g => [g.kimlik, []]));
    for (const k of kartlar || []) { if (!m.has(k.grup)) m.set(k.grup, []); m.get(k.grup).push(k); }
    return [...m.entries()].filter(([, l]) => l.length).map(([g, l]) => ({ grup: GRUPLAR.find(x => x.kimlik === g) || { kimlik: g, ad: g, aciklama: '' }, kartlar: l }));
  }

  /** Saf: Ana sayfa "Bu hafta" modeli. */
  function haftaModeli(h) {
    if (!h || h.success === false) return { satirlar: [], bos: 'Takvim okunamadı.' };
    const satirlar = (h.olaylar || []).map(o => ({ metin: o.metin, sonuc: o.sonuc || null, gecti: !!o.gecti }));
    const sonraki = (h.sonraki || []).map(o => ({ metin: o.metin, sonuc: null, gecti: false }));
    return { satirlar, sonraki, bos: satirlar.length ? null : (sonraki.length ? 'Bu hafta kalan olay yok.' : 'Bu hafta takvimde olay yok.') };
  }

  /* ── Çizim ───────────────────────────────────────────────────────────────── */

  /** Küçük çizgi grafiği: seri [[x, v]] (x gün metni ya da ms) → SVG. */
  function cizgi(seri) {
    const { svg } = AG.dom;
    const l = (seri || []).filter(p => p && sayiMi(p[1]));
    if (l.length < 2) return null;
    const vs = l.map(p => p[1]);
    const mn = Math.min(...vs), mx = Math.max(...vs), ar = mx - mn || 1;
    const G = 240, Y = 48;
    const nokta = l.map((p, i) => `${(i / (l.length - 1) * G).toFixed(1)},${(Y - 2 - (p[1] - mn) / ar * (Y - 4)).toFixed(1)}`).join(' ');
    const sifir = mn < 0 && mx > 0 ? Y - 2 - (0 - mn) / ar * (Y - 4) : null;
    return svg('svg', { class: 'pb-cizgi', viewBox: `0 0 ${G} ${Y}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `son ${l.length} nokta; en düşük ${tr(mn, 2)}, en yüksek ${tr(mx, 2)}` }, [
      sifir != null ? svg('line', { class: 'pb-cizgi-sifir', x1: 0, x2: G, y1: sifir.toFixed(1), y2: sifir.toFixed(1) }) : null,
      svg('polyline', { class: 'pb-cizgi-yol', points: nokta, fill: 'none' }),
    ].filter(Boolean));
  }

  function kartCiz(k) {
    const { el } = AG.dom;
    const m = kartModeli(k);
    const dm = durumMetni(k);
    const govde = [];
    if (k.durum !== 'yok') {
      if (m.liste) govde.push(el('ul', { class: k.kimlik === 'rsi' ? 'pb-cipler' : 'pb-liste' }, m.liste.map(x => el('li', { class: x.ton ? `pb-${x.ton}` : null }, [el('span', { text: x.metin }), x.alt ? el('span', { class: 'hint hint-sm mb-0 pb-alt', text: x.alt }) : null]))));
      if (m.satirlar.length) govde.push(el('dl', { class: 'pb-satirlar' }, m.satirlar.flatMap(s => [el('dt', { text: s.e }), el('dd', { class: s.ton ? `pb-${s.ton}` : null, text: s.d })])));
      const c = m.seri ? cizgi(m.seri) : null;
      if (c) govde.push(c);
      if (m.tablo && m.tablo.satirlar.length) govde.push(AG.tablo.kutulu({ sinif: 'pf-tablo pb-tablo', basliklar: m.tablo.basliklar, satirlar: m.tablo.satirlar.map(r => el('tr', null, r.map((h, i) => el('td', { class: i === 0 ? 'pf-sola' : null, text: String(h) })))) }));
      for (const n of m.notlar) govde.push(el('p', { class: 'hint hint-sm mb-0 pb-not', text: n }));
    }
    const ust = [k.kaynak, k.siklik, k.veriZamani && k.durum !== 'yok' ? `veri ${zamanMetni(k.veriZamani)}` : null].filter(Boolean).join(' · ');
    return el('article', { class: `pb-kart pb-durum-${k.durum}`, 'data-kart': k.kimlik }, [
      el('header', { class: 'pb-kart-bas' }, [el('h4', { class: 'pb-kart-baslik', text: k.baslik }),
        k.durum !== 'iyi' ? el('span', { class: `badge ${k.durum === 'bayat' ? 'badge-warning' : ''} pb-rozet`, text: k.durum === 'bayat' ? 'bayat' : 'veri yok' }) : null]),
      dm ? el('p', { class: `pb-durum-metni ${k.durum === 'bayat' ? 'tone-warning' : 'tone-muted'}`, text: dm }) : null,
      el('div', { class: k.durum === 'bayat' ? 'pb-govde pb-soluk' : 'pb-govde' }, govde),
      el('p', { class: 'hint hint-sm mb-0 pb-kaynak', text: ust }),
      k.sinandi ? el('p', { class: `hint hint-sm mb-0 pb-sinandi${k.sinandi.acik ? ' pb-sinandi-acik' : ''}`, text: k.sinandi.metin }) : null,
    ]);
  }

  function ciz(v) {
    const kok = bul('pbKok');
    if (!kok || !AG.dom) return;
    const { el, doldur } = AG.dom;
    const durum = bul('pbDurum');
    if (durum) {
      const ek = v && v.evKaynak ? (v.evKaynak.eski ? `sunucuya ulaşılamadı — son kopya ${zamanMetni(v.evKaynak.zaman)}` : 'sunucunun verisi') : null;
      doldur(durum, [el('span', { text: !v ? 'Okunamadı.' : v.ornek ? 'ÖRNEK veri — kılavuz görüntüsü, sayılar gerçek değil' : v.calisiyor ? `Toplayıcı çalışıyor · ${zamanMetni(v.zaman)}` : `Toplayıcı bu bilgisayarda çalışmıyor${v.neden ? ` (${v.neden})` : ''}` }),
        ek ? el('span', { class: 'hint hint-sm mb-0', text: ` · ${ek}` }) : null, v && v.kararPenceresi ? el('span', { class: 'hint hint-sm mb-0', text: ' · botların karar penceresi: ağ isteği yok' }) : null]);
    }
    if (!v || !Array.isArray(v.kartlar)) { doldur(kok, [el('p', { class: 'hint mb-0', text: (v && v.error) || 'Piyasa bağlamı okunamadı.' })]); return; }
    doldur(kok, grupla(v.kartlar).map(({ grup, kartlar }) => el('section', { class: 'glass-panel panel-pad mb-3 pb-grup', 'data-grup': grup.kimlik }, [
      el('h3', { class: 'card-title mb-1', text: grup.ad }), grup.aciklama ? el('p', { class: 'hint hint-sm mb-3', text: grup.aciklama }) : null,
      el('div', { class: 'pb-izgara' }, kartlar.map(kartCiz)),
    ])));
    const kk = bul('pbKaynaklar');
    if (kk) {
      doldur(kk, [AG.tablo.kutulu({ sinif: 'pf-tablo', basliklar: ['Kaynak', 'Ne', 'Sıklık', 'Son başarı', 'Son hata'],
        satirlar: (v.kaynaklar || []).map(s => el('tr', null, [el('td', { class: 'pf-sola' }, [el('strong', { text: s.kisaAd })]), el('td', { class: 'pf-sola hint hint-sm', text: s.ne }), el('td', { class: 'pf-sola', text: s.siklik }),
          el('td', { text: s.sonBasari ? zamanMetni(s.sonBasari) : '—' }), el('td', { class: `pf-sola ${s.sonHata ? 'tone-warning' : 'tone-muted'}`, text: s.sonHata || '—' })])) })]);
    }
  }

  async function yukle() {
    if (!bul('pbKok') || !AG.api) return;
    let v = null;
    try { v = await AG.api.piyasaBaglami.ozet(); } catch (e) { v = { success: false, error: e.message }; }
    ciz(v);
  }

  async function anaKartYukle() {
    const k = bul('anaBuHafta');
    if (!k || !AG.api || !AG.dom) return;
    const { el, doldur } = AG.dom;
    let h = null;
    try { h = await AG.api.piyasaBaglami.hafta(); } catch (e) { h = null; }
    const m = haftaModeli(h);
    doldur(k, [
      el('h3', { class: 'card-title mb-2' }, [el('i', { class: 'tone-primary', 'data-lucide': 'calendar-days' }), el('span', { text: ' Bu hafta' }),
        el('span', { class: 'badge pb-bilgi-rozet', text: 'yalnız bilgi' })]),
      m.bos ? el('p', { class: 'hint mb-2', text: m.bos }) : el('ul', { class: 'pb-liste pb-ana-liste mb-2' }, m.satirlar.map(s => el('li', { class: s.gecti && !s.sonuc ? 'pb-soluk' : null }, [el('span', { text: s.metin }), s.sonuc ? el('span', { class: 'hint hint-sm mb-0 pb-alt', text: s.sonuc }) : null]))),
      m.sonraki.length ? el('p', { class: 'hint hint-sm mb-1', text: 'Gelecek hafta:' }) : null,
      m.sonraki.length ? el('ul', { class: 'pb-liste pb-ana-liste mb-2' }, m.sonraki.map(s => el('li', null, [el('span', { text: s.metin })]))) : null,
      el('a', { class: 'no-underline', href: '#/piyasa', text: 'Piyasa bağlamı →' }),
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => {
      const b = e.detail && e.detail.bolum;
      if (b === 'tab-piyasa') yukle();
      if (b === 'tab-ana') anaKartYukle();
    });
  }

  AG.pages = AG.pages || {};
  AG.pages.piyasaBaglami = { yukle, anaKartYukle, kartModeli, durumMetni, grupla, haftaModeli, usd, GRUPLAR };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.piyasaBaglami;
})(typeof window !== 'undefined' ? window : globalThis);
