/**
 * BORSA HESAPLARI — "Botların borsadaki hesaplarında gerçekte ne var?" (62.7; eski adı Hesaplar, Pusula P3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kullanıcıyla taslak üzerinden (2 tur) kararlaştırıldı: SEKME = HESAP.
 *
 *   sekmeler      #borsaSekmeler — her bot hesabı (Binance demo · Denge kâğıt …) + "Canlı hesap" (2027'ye kadar
 *                 kilitli bilgi sekmesi). Sekme adında bakiye ve sağlık ışığı: bakiyeler tek satırda görünür.
 *   hesap paneli  #borsaPanel — başlık + büyük sağlık rozeti (Bağlantı sağlıklı / Bot durdu / Okunamadı …), sorun varsa
 *                 "Ne oldu? / Ne yapmalı" bandı; sayılar (bakiye, açık pozisyon, bekleyen emir, bu ay ödenen ücret);
 *                 sağlık kutuları (borsaya bağlı, kayıtlar borsayla aynı, saat doğru, koruma stopları);
 *                 "Ne var?" — Açık pozisyonlar · Bekleyen emirler · Geçmiş işlemler (son 30 gün, sayfalı).
 *                 Bot pozisyonu satırı tıklanınca o botun Botlar sekmesi açılır.
 *   Arşiv         #arsivKagitKok — eski kâğıt test motorunun hesabı aynı panelle (Kapat düğmeli).
 *   Ayarlar       #hesapDokum — İşlem dökümü: hesap/kimin/tarih süzgeci + CSV (bu sayfada CSV yok).
 *
 * Demo API anahtarı ve canlı hesap bölümü Ayarlar › Borsa'da, elle emir Arşiv'de (js/pages/borsa.js).
 * Veri: GET /api/hesaplar (lib/hesaplar.js, borsa okuması 15 sn önbellekli) ve GET /api/hesaplar/islemler?hesap=… —
 * ikisi de SALT OKUMA. Ekran açıkken 15 sn'de bir tazelenir. Telefonda tablolar kart olur (js/core/tablo.js).
 * Araştırma modu: Kapat / İptal düğmeleri `data-kilit="arastirma"` (js/pages/kabuk.js). Tüm DOM `AG.dom.el`; inline stil yok.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const { el, doldur, bul } = AG.dom;
  const doc = global.document;
  const yardim = (k) => (AG.sozluk ? AG.sozluk.yardim(k) : null);

  const YENILE_MS = 15000;
  const SECILI_ANAHTAR = 'ag.borsa.secili';
  const TELEFON_SATIR = 5;
  let son = null;                      // son /api/hesaplar yanıtı
  let secili = null;                   // seçili hesap kimliği (testnet, kagit-denge, live …)
  const gorunum = {};                  // hesap → 'poz' | 'emir' | 'gecmis'
  const gecmisSayfa = {};              // hesap → sayfa
  let tumunuGoster = false;
  let zamanlayici = null;
  let yukleniyor = false;
  try { secili = global.localStorage ? global.localStorage.getItem(SECILI_ANAHTAR) : null; } catch (e) { secili = null; }

  // ── Biçim ───────────────────────────────────────────────────────────────
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const para = (x, b = 2) => (sayiMi(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b }) : '—');
  /** İşaretli tutar; yuvarlanınca sıfır olan küçük eksi "-0,00" yazılmaz. */
  const isaretli = (x, b = 2) => { if (!sayiMi(x)) return '—'; const y = Math.abs(x) < 0.5 * Math.pow(10, -b) ? 0 : x; return `${y > 0 ? '+' : ''}${para(y, b)}`; };
  /** Ton yazılan değere göre: "0,00" görünen küçük K/Z kırmızı/yeşil boyanmaz. */
  const ton = (x, b = 2) => (sayiMi(x) ? AG.fmt.tonSinifi(Math.abs(x) < 0.5 * Math.pow(10, -b) ? 0 : x) : '');
  const miktar = (x) => (sayiMi(x) ? (+x.toPrecision(8)).toLocaleString('tr-TR', { maximumFractionDigits: 8 }) : '—');
  const fiyat = (x) => (!sayiMi(x) ? '—' : Math.abs(x) >= 100 ? para(x, 2) : x.toLocaleString('tr-TR', { maximumSignificantDigits: 6 }));
  const zaman = (t) => (t ? AG.fmt.tarihSaat(t) : '—');
  const yuzde = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}%${Math.abs(x).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
  const islemAdi = (s) => (s === 'buy' ? 'Alış' : s === 'sell' ? 'Satış' : '—');
  /** "BTC/USDT:USDT" → "BTC"; "BTC/USDT (spot)" → "BTC (spot)". */
  const coin = (s) => String(s || '—').split(':')[0].replace('/USDT', '');

  /** Saf: yerel takvimde 30 gün önce 'YYYY-AA-GG'. */
  function otuzGunOnce(simdi) {
    const d = new Date(simdi == null ? Date.now() : simdi); d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ── Saf yardımcılar (test edilir) ───────────────────────────────────────
  const BOT_AD = { hucum: 'Hücum', denge: 'Denge', kalkan: 'Kalkan', elle: 'Elle' };
  /** Saf: hesap kimliği → sekme adı. */
  function hesapAdi(hesap) {
    if (hesap === 'testnet') return 'Binance demo';
    if (hesap === 'live') return 'Canlı hesap';
    if (hesap === 'kagit-motor') return 'Kâğıt test hesabı';
    if (hesap === 'kagit-borsa') return 'Elle kâğıt hesabı';
    const m = /^kagit-(.+)$/.exec(String(hesap || ''));
    if (m) return `${BOT_AD[m[1]] || m[1]} kâğıt hesabı`;
    return String(hesap || '—');
  }
  /** Saf: hesabın ne olduğu, tek satır. */
  function hesapTuru(b) {
    const o = b.ortam || (b.hesap === 'testnet' ? 'testnet' : b.hesap === 'live' ? 'live' : b.hesap === 'kagit-motor' ? 'motor' : 'kagit');
    if (o === 'testnet') return 'Binance Demo Trading — canlı hesap değil';
    if (o === 'live') return 'Binance — canlı hesap';
    if (o === 'motor') return 'Arşiv › Kâğıt test motorunun sanal hesabı — borsaya emir gitmez';
    return 'Bilgisayarda tutulan sanal hesap — borsaya emir gitmez';
  }
  /** Saf: sekme listesi — eski kâğıt test motoru (Arşiv'de) hariç; canlı hesap yoksa kilitli bilgi sekmesi eklenir. */
  function sekmeListesi(v) {
    const l = ((v && v.baglantilar) || []).filter(b => b.hesap !== 'kagit-motor');
    if (!l.some(b => b.hesap === 'live')) l.push({ hesap: 'live', kilitli: true, kaynakAdlari: [] });
    return l;
  }
  /** Saf: tasfiye fiyatına %10'dan yakın mı ("zorla kapanmaya yakın"). */
  function zorlaKapanmayaYakin(p) {
    if (!p || !sayiMi(p.likidasyon) || !sayiMi(p.mark) || p.mark <= 0) return false;
    return Math.abs((p.mark - p.likidasyon) / p.mark) < 0.10;
  }
  /**
   * Saf: borsadaki vadeli hesapta koruma stopu olmayan pozisyonlar. 67.5: sunucu 'haric' derse (Hücum demo BTC ayağı bilerek
   * stopsuz — kullanıcı kararı 2026-10-07) eksik SAYILMAZ.
   */
  function korumasizlar(pozlar) {
    return (pozlar || []).filter(p => !p.spot && (p.ortam === 'testnet' || p.ortam === 'live') && (!p.koruma || p.koruma.durum === 'yok'));
  }
  /** Saf (67.5): bilerek stopsuz bırakılan pozisyonlar (koruma.durum 'haric'). */
  function bilerekStopsuz(pozlar) {
    return (pozlar || []).filter(p => p.koruma && p.koruma.durum === 'haric');
  }
  /** Saf: bekleyen emrin ne olduğu, sade adla. */
  function emirNe(e) {
    const n = String(e.neden || '');
    if (/felaket|koruma/i.test(n)) return 'Koruma stopu';
    if (/kâr al/i.test(n)) return 'Kâr alma';
    if (/DCA/i.test(n)) return 'Kademe alımı';
    if (/stop/i.test(String(e.tur || ''))) return 'Stop emri';
    if (/borsa arayüz/i.test(n)) return 'Borsadan elle';
    return e.tur === 'market' ? 'Piyasa emri' : 'Limit emri';
  }

  /**
   * Saf: hesabın sağlığı → { ton: 'iyi'|'uyari'|'tehlike'|'notr', baslik, neOldu, neYapmali, kutular: [{ ton, baslik, alt }] }.
   * Öncelik: kilitli → bağlı değil → okunamadı → durduruldu (tehlike) → karşılaştırma / saat / koruma stopu (uyarı) → sağlıklı.
   */
  function saglik(b, pozlar) {
    if (b.kilitli) return { ton: 'notr', baslik: 'Kilitli', neOldu: null, neYapmali: null, kutular: [] };
    const bot = (b.kaynaklar || []).find(k => k === 'hucum' || k === 'denge');
    const botAd = bot ? BOT_AD[bot] : null;
    const borsa = b.ortam === 'testnet' || b.ortam === 'live' || (!b.ortam && (b.hesap === 'testnet' || b.hesap === 'live'));
    if (!b.bagli) {
      return { ton: 'uyari', baslik: botAd ? 'Bot durdu' : 'Bağlı değil',
        neOldu: botAd ? `${botAd} çalışmıyor; ${borsa ? 'hesap borsadan okunmuyor' : 'sanal hesap olduğu gibi duruyor'}.` : 'Bu hesaba bağlantı yok.',
        neYapmali: botAd ? `Botlar › ${botAd} › Başlat.` : null, kutular: [] };
    }
    if (b.hata) return { ton: 'tehlike', baslik: 'Okunamadı', neOldu: `Hesap okunamadı: ${b.hata}.`, neYapmali: 'İnternet bağlantısını ve API anahtarını (Ayarlar › Borsa) kontrol edin; ekran 15 sn\'de bir yeniden dener.', kutular: [] };
    const s = { ton: 'iyi', baslik: borsa ? 'Bağlantı sağlıklı' : 'Çalışıyor', neOldu: null, neYapmali: null, kutular: [] };
    const kutu = (t, baslik, alt) => s.kutular.push({ ton: t, baslik, alt });
    const sorun = (t, baslik, neOldu, neYapmali) => { if (s.ton === 'iyi' || (s.ton === 'uyari' && t === 'tehlike')) { s.ton = t; s.baslik = baslik; s.neOldu = neOldu; s.neYapmali = neYapmali; } };
    if (b.durum === 'DURDURULDU') sorun('tehlike', 'Durduruldu', `Hesap durduruldu${b.durmaSebebi ? `: ${b.durmaSebebi}` : ''}.`, botAd ? `Botlar › ${botAd} — durma nedenini okuyup engeli kaldırın.` : null);
    if (b.durum === 'BEKLIYOR') { s.ton = 'notr'; s.baslik = 'Boşta'; }
    kutu('iyi', borsa ? 'Borsaya bağlı' : 'Hesap okunuyor', b.okundu ? `son okuma ${AG.fmt.saat(b.okundu)}` : 'okundu');
    if (!borsa) return s;
    const m = b.sonMutabakat;
    if (!m) kutu('notr', 'Henüz karşılaştırılmadı', 'kayıtlar ↔ borsa');
    else if (m.hata) { kutu('tehlike', 'Karşılaştırma hatalı', m.hata); sorun('uyari', 'Karşılaştırma hatalı', `Kayıtlar borsayla karşılaştırılamadı: ${m.hata}.`, 'Botlar › Yönetim › Borsayla karşılaştır.'); }
    else if ((m.cozulemeyen || 0) > 0) { kutu('uyari', 'Kayıtlar borsayla farklı', `${m.cozulemeyen} fark · ${AG.fmt.saat(m.zaman)}`); sorun('uyari', 'Kayıtlar borsayla farklı', `Son karşılaştırmada ${m.cozulemeyen} fark bulundu.`, 'Botlar › Yönetim › Borsayla karşılaştır; fark sürerse bot kendini durdurur.'); }
    else kutu('iyi', 'Kayıtlar borsayla aynı', `son karşılaştırma ${AG.fmt.saat(m.zaman)}`);
    const f = b.saatFarkMs;
    const sn = sayiMi(f) ? (Math.abs(f) / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : null;
    if (!sayiMi(f)) kutu('notr', 'Saat ölçülmedi', 'borsa saatiyle');
    else if (Math.abs(f) > 1000) { kutu('uyari', 'Saat kaymış', `borsayla fark ${sn} sn`); sorun('uyari', 'Saat kaymış', `Bilgisayar saati borsadan ${sn} sn farklı; borsa istekleri reddedebilir.`, 'Windows › Tarih ve saat › Şimdi eşitle.'); }
    else kutu('iyi', 'Saat doğru', `borsayla fark ${sn} sn`);
    const p = (pozlar || []).filter(x => x.hesap === b.hesap && !x.spot);
    const eksik = korumasizlar(p);
    const haric = bilerekStopsuz(p);
    const haricNot = haric.length ? ` · ${haric.map(x => coin(x.symbol)).join(', ')} bilerek stopsuz` : '';
    if (!p.length) kutu('notr', 'Pozisyon yok', 'koruma stopu gerekmiyor');
    else if (eksik.length) { kutu('uyari', 'Koruma stopu eksik', `${p.length - eksik.length - haric.length} / ${p.length - haric.length} pozisyonda var${haricNot}`); sorun('uyari', 'Koruma stopu eksik', `${eksik.map(x => coin(x.symbol)).join(', ')} pozisyonunun borsada koruma stopu yok.`, botAd ? 'Bot sonraki çalışmasında yeniden koyar; sürerse Botlar › Yönetim › Borsayla karşılaştır.' : 'Pozisyonu borsada elle koruyun ya da kapatın.'); }
    else if (haric.length === p.length) kutu('notr', 'Koruma stopu gerekmiyor', `${haric.map(x => coin(x.symbol)).join(', ')} bilerek stopsuz`);
    else kutu('iyi', 'Her pozisyonun koruma stopu var', `${p.length - haric.length} / ${p.length - haric.length}${haricNot}`);
    return s;
  }

  // ── Ortak parçalar ──────────────────────────────────────────────────────
  const kimin = (kod, ad) => el('span', { class: `hs-kaynak hs-kaynak-${String(kod || '').replace(/[^a-z]/gi, '')}`, text: ad || BOT_AD[kod] || kod || '—' });
  /** Hücre: `data-etiket` telefondaki kart görünümünün başlığı; `hs-metin` yazı tipini Plex Sans'a döndürür. */
  function hucre(etiket, icerik, sinif) {
    const p = { 'data-etiket': etiket, class: sinif || '' };
    if (!Array.isArray(icerik)) p.text = String(icerik == null ? '—' : icerik);
    return el('td', p, Array.isArray(icerik) ? icerik : null);
  }
  const baslik = (metin, terim) => el('th', null, [el('span', { text: metin }), terim ? yardim(terim) : null]);
  const tablo = (id, basliklar, satirlar) => AG.tablo.kutulu({ id, sinif: 'hs-tablo', basliklar, satirlar, siralanabilir: true });
  const sayiKutu = (etiket, deger, alt) => el('div', { class: 'ana-sayi' }, [
    el('span', { class: 'stat-title', text: etiket }),
    el('span', { class: 'stat-value stat-value-sm sayi', text: deger }),
    alt ? el('span', { class: 'hint hint-sm mb-0', text: alt }) : null
  ]);
  const TON_SINIF = { iyi: 'bot-durum-iyi', uyari: 'bot-durum-uyari', tehlike: 'bot-durum-tehlike', notr: '' };
  const rozet = (t, metin, id) => el('span', { class: `bot-durum-buyuk ${TON_SINIF[t] || ''}`, id: id || null }, [el('span', { class: 'bot-durum-isik', 'aria-hidden': 'true' }), el('span', { text: metin })]);

  // ── Sekmeler ────────────────────────────────────────────────────────────
  function seciliHesap(v) {
    const l = sekmeListesi(v);
    if (secili && l.some(b => b.hesap === secili)) return secili;
    const ilk = l.find(b => b.bagli) || l[0];
    return ilk ? ilk.hesap : null;
  }

  function sekmelerCiz(v) {
    const k = bul('borsaSekmeler');
    if (!k) return;
    const aktif = seciliHesap(v);
    doldur(k, sekmeListesi(v).map(b => {
      const sg = saglik(b, v.pozisyonlar);
      const bak = b.bakiye && sayiMi(b.bakiye.toplam) ? `${para(b.bakiye.toplam, 0)} USDT` : null;
      return el('button', { type: 'button', role: 'tab', id: `borsaSekme-${b.hesap}`, class: `pf-alt-sekme borsa-sekme${b.hesap === aktif ? ' is-active' : ''}`,
        'aria-selected': b.hesap === aktif ? 'true' : 'false', title: sg.baslik, onclick: () => sec(b.hesap) }, [
        el('span', { class: `borsa-isik borsa-isik-${b.kilitli ? 'notr' : sg.ton}`, 'aria-hidden': 'true' }),
        el('span', { text: hesapAdi(b.hesap) }),
        bak ? el('span', { class: 'borsa-sekme-bakiye sayi', text: bak }) : null,
        b.kilitli ? el('span', { class: 'pf-is-sayi borsa-kilit', text: 'kilitli' }) : null
      ]);
    }));
  }

  function sec(hesap) {
    secili = hesap;
    tumunuGoster = false;
    try { if (global.localStorage) global.localStorage.setItem(SECILI_ANAHTAR, hesap); } catch (e) { /* özel pencere */ }
    if (!son) return;
    sekmelerCiz(son);
    const pan = bul('borsaPanel');
    if (pan) { pan.dataset.hesap = seciliHesap(son); panelCiz(pan, son, seciliHesap(son), {}); }
  }

  // ── Hesap paneli ────────────────────────────────────────────────────────
  function kilitliPanel(kok) {
    doldur(kok, [el('div', { class: 'glass-panel panel-pad borsa-panel', id: 'borsaHesap-live' }, [
      el('div', { class: 'row-between row-wrap gap-2' }, [el('h3', { class: 'card-title m-0', text: 'Canlı hesap' }), rozet('uyari', 'Kilitli', 'borsaRozet-live')]),
      el('p', { class: 'mb-2', text: 'Bilinçli olarak kapalı. En erken 5 Ocak 2027\'de, dokuz şartın hepsi sağlanınca açılır. Açılınca bu görünüm demo hesabıyla aynı düzende olur.' }),
      el('p', { class: 'hint hint-sm mb-0' }, [el('span', { text: 'Canlı anahtar alanları ve bağlan düğmesi ' }), el('a', { href: '#/ayarlar/borsa', text: 'Ayarlar › Bağlantılar' }), el('span', { text: '\'da, katlı ve pasif.' })])
    ])]);
  }

  /** Bir hesabın paneli. o.arsiv: Arşiv'deki kâğıt test hesabı (Kapat düğmeleri). */
  function panelCiz(kok, v, hesap, o) {
    if (!kok || !v) return;
    const b = sekmeListesi(v).concat((v.baglantilar || []).filter(x => x.hesap === 'kagit-motor')).find(x => x.hesap === hesap);
    if (!b) { doldur(kok, [el('p', { class: 'hint mb-0 bos-durum', text: 'Hesap yok.' })]); return; }
    if (b.kilitli) { kilitliPanel(kok); return; }
    const pozlar = (v.pozisyonlar || []).filter(p => p.hesap === hesap);
    const emirler = (v.acikEmirler || []).filter(e => e.hesap === hesap);
    const sg = saglik(b, v.pozisyonlar);
    const kzVar = pozlar.some(p => sayiMi(p.kz));
    const kz = pozlar.reduce((t, p) => (sayiMi(p.kz) ? t + p.kz : t), 0);
    const korumaSay = emirler.filter(e => emirNe(e) === 'Koruma stopu').length;
    const kademeSay = emirler.filter(e => emirNe(e) === 'Kademe alımı').length;
    const kullanan = (b.kaynakAdlari || []).filter(Boolean);
    const sanal = b.ortam === 'kagit' || b.ortam === 'motor';
    const g = gorunum[hesap] || 'poz';
    const ek = o.arsiv ? '-arsiv' : '';
    const sekme = (kod, metin) => el('button', { type: 'button', class: `btn btn-xs ${g === kod ? 'btn-primary' : 'btn-secondary'} borsa-gorunum`, id: `borsaGorunum-${kod}${ek}`,
      'aria-pressed': g === kod ? 'true' : 'false', text: metin, onclick: () => { gorunum[hesap] = kod; tumunuGoster = false; panelCiz(kok, v, hesap, o); } });
    const icerik = el('div', { id: `borsaIcerik${ek}`, class: 'borsa-icerik' });
    doldur(kok, [el('div', { class: 'glass-panel panel-pad borsa-panel', id: `borsaHesap-${hesap}` }, [
      el('div', { class: 'row-between row-wrap gap-2' }, [
        el('div', { class: 'bot-bas-metin' }, [
          el('h3', { class: 'card-title m-0', text: hesapAdi(hesap) }),
          el('span', { class: 'hint hint-sm mb-0', text: `${kullanan.length ? `Kullanan: ${kullanan.join(', ')} · ` : ''}${hesapTuru(b)}` })
        ]),
        rozet(sg.ton, sg.baslik, `borsaRozet-${hesap}`)
      ]),
      sg.neOldu ? el('div', { class: `borsa-sorun borsa-sorun-${sg.ton}`, role: 'status', id: `borsaSorun-${hesap}` }, [
        el('p', { class: 'mb-0' }, [el('strong', { text: 'Ne oldu? ' }), el('span', { text: sg.neOldu })]),
        sg.neYapmali ? el('p', { class: 'mb-0' }, [el('strong', { text: 'Ne yapmalı: ' }), el('span', { text: sg.neYapmali })]) : null
      ]) : null,
      el('div', { class: 'ana-sayilar borsa-sayilar', id: `borsaSayilar-${hesap}` }, [
        // 64.5: toplam = Binance "Margin Balance" (hesap değeri); serbest = Binance "Avbl" (teminatlar düşülmüş) — ikisi yan yana.
        sayiKutu('Bakiye', b.bakiye && sayiMi(b.bakiye.toplam) ? `${para(b.bakiye.toplam)} USDT` : '—', b.bakiye
          ? (sayiMi(b.bakiye.serbest) && b.bakiye.serbest !== b.bakiye.toplam ? `pozisyonlar dahil (Margin Balance) · kullanılabilir (Avbl) ${para(b.bakiye.serbest)}` : 'pozisyonlar dahil')
          : (b.bagli ? null : 'okunmuyor')),
        sayiKutu('Açık pozisyon', String(pozlar.length), kzVar ? `şu an ${isaretli(kz)} USDT` : null),
        sayiKutu('Bekleyen emir', String(emirler.length), [korumaSay ? `${korumaSay} koruma stopu` : '', kademeSay ? `${kademeSay} kademe` : ''].filter(Boolean).join(' · ') || null),
        sayiKutu('Bu ay ödenen ücret', sayiMi(b.ucretBuAy) ? `${para(b.ucretBuAy)} USDT` : '—', sanal ? 'sanal' : null)
      ]),
      sg.kutular.length ? el('ul', { class: 'borsa-saglik', id: `borsaSaglik-${hesap}` }, sg.kutular.map(x => el('li', { class: `borsa-saglik-${x.ton}` }, [
        el('span', { class: 'borsa-saglik-bas' }, [el('span', { class: `borsa-isik borsa-isik-${x.ton}`, 'aria-hidden': 'true' }), el('span', { text: x.baslik })]),
        el('span', { class: 'hint hint-sm mb-0', text: x.alt })
      ]))) : null,
      el('div', { class: 'bot-blok' }, [
        el('div', { class: 'row-between row-wrap gap-2 mb-2' }, [
          el('h4', { class: 'm-0', text: 'Ne var?' }),
          el('div', { class: 'row-inline row-wrap gap-1', role: 'group', 'aria-label': 'Görünüm' }, [
            sekme('poz', `Açık pozisyonlar (${pozlar.length})`), sekme('emir', `Bekleyen emirler (${emirler.length})`), sekme('gecmis', 'Geçmiş işlemler')])
        ]),
        icerik
      ])
    ])]);
    if (g === 'poz') pozisyonlarCiz(icerik, pozlar, b, o);
    else if (g === 'emir') emirlerCiz(icerik, emirler);
    else gecmisYukle(icerik, hesap);
  }

  // ── Açık pozisyonlar ────────────────────────────────────────────────────
  function korumaHucresi(p) {
    const k = p.koruma || {};
    if (k.durum === 'borsada') return { metin: sayiMi(k.fiyat) ? `${fiyat(k.fiyat)} · yerinde` : 'yerinde', ton: 'tone-success' };
    if (k.durum === 'belirsiz') return { metin: `${fiyat(k.fiyat)} · doğrulanmadı`, ton: 'tone-warning' };
    if (k.durum === 'motor') return { metin: `${fiyat(k.fiyat)} · motor içi`, ton: '' };
    if (k.durum === 'haric') return { metin: 'bilerek stopsuz', ton: 'tone-muted', rozet: true, neden: k.neden || 'bilerek stopsuz' };
    if (k.durum === 'gerekmez') return { metin: p.spot ? 'gerekmez (spot)' : 'gerekmez (sanal)', ton: 'tone-muted' };
    const borsadaVadeli = !p.spot && (p.ortam === 'testnet' || p.ortam === 'live');
    return { metin: 'yok', ton: borsadaVadeli ? 'tone-warning' : 'tone-muted' };
  }

  function botaGit(kaynak) {
    if (kaynak !== 'hucum' && kaynak !== 'denge') return;
    if (AG.pages.botlar && AG.pages.botlar.sec) AG.pages.botlar.sec(kaynak);
    if (AG.rota) AG.rota.git('botlar');
  }

  function pozisyonSatiri(p, o) {
    const kr = korumaHucresi(p);
    const maliyet = sayiMi(p.giris) && sayiMi(p.miktar) ? Math.abs(p.giris * p.miktar) : null;
    const kzY = sayiMi(p.kz) && maliyet > 0 ? (p.kz / maliyet) * 100 : null;
    const yakin = zorlaKapanmayaYakin(p);
    const botun = p.kaynak === 'hucum' || p.kaynak === 'denge';
    const kapat = o.arsiv && p.kapatilabilir ? el('button', { type: 'button', class: 'btn btn-xs btn-outline-danger', 'data-kilit': 'arastirma',
      title: 'Kâğıt test pozisyonunu piyasa fiyatından kapat (onay ister)', text: 'Kapat',
      onclick: (e) => { if (e && e.stopPropagation) e.stopPropagation(); if (typeof global.closeDockPosition === 'function') global.closeDockPosition(p.symbol); } }) : null;
    return el('tr', { class: `${botun ? 'hs-tikla' : ''}${yakin ? ' hs-tehlike' : ''}`.trim(), title: botun ? `${BOT_AD[p.kaynak]} sekmesini aç` : null, onclick: botun ? () => botaGit(p.kaynak) : null }, [
      hucre('Coin', [el('strong', { text: coin(p.symbol) }), p.yon === 'short' ? el('span', { class: 'hs-alt tone-danger', text: 'short' }) : null], 'hs-metin'),
      hucre('Kimin', [kimin(p.kaynak, p.kaynakAd)], 'hs-metin'),
      hucre('Miktar', miktar(p.miktar)),
      hucre('Giriş', fiyat(p.giris)),
      hucre('Şimdi', fiyat(p.mark)),
      hucre('Şu an K/Z (USDT)', [el('span', { text: isaretli(p.kz) }), kzY != null ? el('span', { class: 'hs-alt', text: yuzde(kzY) }) : null], ton(p.kz)),
      hucre('Koruma stopu', [kr.rozet ? el('span', { class: 'pf-rozet', title: kr.neden, text: kr.metin }) : el('span', { text: kr.metin }),
        kr.rozet ? el('span', { class: 'hs-alt', text: kr.neden }) : null,
        !kr.rozet && p.koruma && p.koruma.haricPay ? el('span', { class: 'hs-alt', text: 'BTC ayağı payı bilerek stopsuz' }) : null, yakin ? el('span', { class: 'hs-alt tone-danger', text: 'zorla kapanmaya yakın' }) : null], `hs-metin ${kr.ton}`),
      o.arsiv ? hucre('', kapat ? [kapat] : '', 'hs-metin hs-eylem') : null
    ].filter(Boolean));
  }

  function pozisyonlarCiz(k, pozlar, b, o) {
    if (!pozlar.length) {
      doldur(k, [el('p', { class: 'hint mb-0 bos-durum', text: b.bagli ? 'Açık pozisyon yok.' : 'Açık pozisyon yok — hesap şu an okunmuyor.' })]);
      return;
    }
    doldur(k, [
      tablo(`tblBorsaPoz${o.arsiv ? 'Arsiv' : ''}`, [baslik('Coin'), baslik('Kimin', 'kaynak'), baslik('Miktar'), baslik('Giriş'), baslik('Şimdi'), baslik('Şu an K/Z (USDT)'),
        baslik('Koruma stopu', 'korumaEmri'), o.arsiv ? el('th', { 'aria-label': 'İşlem' }) : null].filter(Boolean), pozlar.map(p => pozisyonSatiri(p, o))),
      pozlar.some(p => p.kaynak === 'hucum' || p.kaynak === 'denge') ? el('p', { class: 'hint hint-sm mb-0 mt-2', text: 'Bot pozisyonuna tıklayınca o botun Botlar sekmesi açılır.' }) : null
    ]);
  }

  // ── Bekleyen emirler ────────────────────────────────────────────────────
  async function emirIptal(s, dugme) {
    const onay = await AG.onayla({ baslik: 'Emir iptal edilsin mi?', metin: `${islemAdi(s.side)} ${miktar(s.miktar)} ${s.symbol}${sayiMi(s.fiyat) ? ` @ ${fiyat(s.fiyat)}` : ''} borsada iptal edilecek.`,
      onay: 'Emri iptal et', iptal: 'Vazgeç', tehlikeli: true });
    if (!onay) return;
    AG.dom.mesgul(dugme, '…');
    try {
      const r = await AG.api.borsaEmirIptal(s.id);
      if (!r.success) throw new Error(r.error);
      AG.bildir('Emir iptal edildi', 'ok');
    } catch (e) { AG.bildir(`İptal edilemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); yukle(true); }
  }

  function emirlerCiz(k, emirler) {
    if (!emirler.length) { doldur(k, [el('p', { class: 'hint mb-0 bos-durum', text: 'Bekleyen emir yok.' })]); return; }
    const iptalVar = emirler.some(e => e.iptalEdilebilir);
    doldur(k, [tablo('tblBorsaEmir', [baslik('Coin'), baslik('Kimin', 'kaynak'), baslik('Ne'), baslik('İşlem'), baslik('Miktar'), baslik('Fiyat'), baslik('Verildi'),
      iptalVar ? el('th', { 'aria-label': 'İşlem' }) : null].filter(Boolean), emirler.map(e => el('tr', null, [
      hucre('Coin', [el('strong', { text: coin(e.symbol) })], 'hs-metin'),
      hucre('Kimin', [kimin(e.kaynak, e.kaynakAd)], 'hs-metin'),
      hucre('Ne', [el('span', { text: emirNe(e) }), e.durum === 'yerelde bekliyor' ? el('span', { class: 'hs-alt', text: 'henüz borsaya gitmedi' }) : null], 'hs-metin'),
      hucre('İşlem', islemAdi(e.side), `hs-metin ${e.side === 'buy' ? 'tone-success' : e.side === 'sell' ? 'tone-danger' : ''}`),
      hucre('Miktar', miktar(e.miktar)),
      hucre('Fiyat', fiyat(e.fiyat)),
      hucre('Verildi', zaman(e.zaman)),
      iptalVar ? hucre('', e.iptalEdilebilir ? [el('button', { type: 'button', class: 'btn btn-xs btn-outline-danger', 'data-kilit': 'arastirma', title: 'Bu emri borsada iptal et (onay ister)', text: 'İptal',
        onclick: (ev) => emirIptal(e, ev.currentTarget) })] : '', 'hs-metin hs-eylem') : null
    ].filter(Boolean))))]);
  }

  // ── Geçmiş işlemler (son 30 gün, sayfalı; CSV Ayarlar › Borsa'da) ──────
  const telefonGenisligi = () => !!(global.matchMedia && global.matchMedia('(max-width: 640px)').matches);

  async function gecmisYukle(k, hesap) {
    doldur(k, [el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]);
    try {
      const r = await AG.api.hesaplarIslemler({ durum: 'gecmis', hesap, bas: otuzGunOnce(), sayfa: gecmisSayfa[hesap] || 1 });
      if (!r || !r.success) throw new Error((r && r.error) || 'yanıt yok');
      gecmisCiz(k, hesap, r);
    } catch (e) {
      doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Geçmiş işlemler okunamadı', yeniden: () => gecmisYukle(k, hesap) })]);
    }
  }

  function gecmisSatiri(s) {
    const fon = s.tur === 'fonlama';
    const tutar = !fon && sayiMi(s.miktar) && sayiMi(s.fiyat) ? Math.abs(s.miktar * s.fiyat) : null;
    const kz = fon ? s.tutar : s.kz;
    return el('tr', null, [
      hucre('Tarih', zaman(s.zaman)),
      hucre('Coin', [el('strong', { text: coin(s.symbol) })], 'hs-metin'),
      hucre('İşlem', fon ? 'Fonlama' : islemAdi(s.side), `hs-metin ${fon ? '' : s.side === 'buy' ? 'tone-success' : 'tone-danger'}`),
      hucre('Kimin', [kimin(s.kaynak, s.kaynakAd)], 'hs-metin'),
      hucre('Miktar', fon ? '—' : miktar(s.miktar)),
      hucre('Fiyat', fon ? '—' : fiyat(s.fiyat)),
      hucre('Tutar (USDT)', tutar != null ? para(tutar) : '—'),
      hucre('Ücret', sayiMi(s.ucret) ? para(s.ucret) : '—'),
      hucre('Kâr/zarar', isaretli(kz), ton(kz))
    ]);
  }

  function gecmisCiz(k, hesap, r) {
    const t = r.toplamlar || {};
    const toplam = el('p', { class: 'hs-toplam mb-0' }, [el('span', { class: 'sayi',
      text: `son 30 gün: ${t.islem || 0} işlem · ücret ${para(t.ucret || 0)} · kâr/zarar ${isaretli(t.kz || 0)}${t.fonlama ? ` · fonlama ${isaretli(t.fonlama)}` : ''} USDT` }), t.fonlama ? yardim('fonlama') : null]);
    const dokumBag = el('p', { class: 'hint hint-sm mb-0 mt-2' }, [el('span', { text: 'Daha eski işlemler ve CSV: ' }), el('a', { href: '#/ayarlar/borsa', text: 'Ayarlar › Borsa › İşlem dökümü' })]);
    if (!r.satirlar || !r.satirlar.length) { doldur(k, [el('p', { class: 'hint mb-0 bos-durum', text: 'Son 30 günde işlem yok.' }), dokumBag]); return; }
    const kisalt = telefonGenisligi() && !tumunuGoster && r.satirlar.length > TELEFON_SATIR;
    const gosterilen = kisalt ? r.satirlar.slice(0, TELEFON_SATIR) : r.satirlar;
    doldur(k, [
      tablo('tblBorsaGecmis', [baslik('Tarih'), baslik('Coin'), baslik('İşlem'), baslik('Kimin', 'kaynak'), baslik('Miktar'), baslik('Fiyat'), baslik('Tutar (USDT)'), baslik('Ücret'), baslik('Kâr/zarar')],
        gosterilen.map(gecmisSatiri)),
      kisalt ? el('button', { type: 'button', class: 'btn btn-sm btn-secondary mt-2', id: 'btnBorsaTumunuGor', text: `Tümünü gör (${r.satirlar.length} kayıt)`,
        onclick: () => { tumunuGoster = true; gecmisCiz(k, hesap, r); } }) : null,
      el('div', { class: 'row-between row-wrap gap-2 mt-2' }, [
        toplam,
        r.toplamSayfa > 1 ? el('div', { class: 'row gap-2' }, [
          el('span', { class: 'hint hint-sm mb-0 sayi', text: `sayfa ${r.sayfa}/${r.toplamSayfa}` }),
          el('button', { type: 'button', class: 'btn btn-xs btn-secondary', id: 'btnBorsaOnceki', text: '‹ Önceki', disabled: r.sayfa <= 1 ? true : undefined,
            onclick: () => { gecmisSayfa[hesap] = Math.max(1, r.sayfa - 1); gecmisYukle(k, hesap); } }),
          el('button', { type: 'button', class: 'btn btn-xs btn-secondary', id: 'btnBorsaSonraki', text: 'Sonraki ›', disabled: r.sayfa >= r.toplamSayfa ? true : undefined,
            onclick: () => { gecmisSayfa[hesap] = Math.min(r.toplamSayfa, r.sayfa + 1); gecmisYukle(k, hesap); } })
        ]) : null
      ]),
      dokumBag
    ]);
  }

  // ── Ayarlar › Borsa › İşlem dökümü (CSV) ────────────────────────────────
  const dokum = { hesap: '', kaynak: '', bas: '', bit: '' };
  function dokumCiz() {
    const k = bul('hesapDokum');
    if (!k) return;
    const hesaplar = ((son && son.baglantilar) || []).map(b => [b.hesap, hesapAdi(b.hesap)]);
    const imza = hesaplar.map(h => h[0]).join(',');
    const csvYolu = () => AG.api.hesaplarCsvYolu({ hesap: dokum.hesap, kaynak: dokum.kaynak, bas: dokum.bas, bit: dokum.bit });
    const tazele = () => { const a = bul('lnkHesaplarCsv'); if (a) a.setAttribute('href', csvYolu()); };
    if (k.dataset.kuruldu && k.dataset.imza === imza) { tazele(); return; }
    k.dataset.imza = imza; k.dataset.kuruldu = '1';
    const secici = (id, etiket, secenekler, alan) => el('label', { class: 'form-group' }, [el('span', { text: etiket }),
      el('select', { id, class: 'form-control control-sm sunken-deep', onchange: (e) => { dokum[alan] = e.target.value; tazele(); } },
        secenekler.map(([v, t]) => { const op = el('option', { value: v, text: t }); if (v === dokum[alan]) op.selected = true; return op; }))]);
    const tarih = (id, etiket, alan) => el('label', { class: 'form-group' }, [el('span', { text: etiket }),
      el('input', { id, type: 'date', class: 'form-control control-sm sunken-deep', value: dokum[alan], onchange: (e) => { dokum[alan] = e.target.value; tazele(); } })]);
    doldur(k, [
      el('p', { class: 'hint hint-sm mb-3', text: 'Bot hesaplarının bütün emir ve işlemleri (vergi ve kayıt için). Excel\'de açılır (; ayraçlı); tarih süzgeci sizin gününüze göre.' }),
      el('div', { class: 'grid-4' }, [
        secici('selDokumHesap', 'Hesap', [['', 'Tüm hesaplar'], ...hesaplar], 'hesap'),
        secici('selDokumKaynak', 'Kimin', [['', 'Hepsi'], ['hucum', 'Hücum'], ['denge', 'Denge'], ['elle', 'Elle'], ['acil', 'Acil fren'], ['kagit', 'Kâğıt test']], 'kaynak'),
        tarih('inpDokumBas', 'Başlangıç', 'bas'),
        tarih('inpDokumBit', 'Bitiş', 'bit')
      ]),
      el('a', { id: 'lnkHesaplarCsv', class: 'btn btn-sm btn-secondary', href: csvYolu(), download: '', title: 'Süzgeçlere uyan bütün satırlar — CSV indir' }, [el('span', { text: 'CSV indir' })])
    ]);
  }

  // ── Yükleme ─────────────────────────────────────────────────────────────
  const gorunurMu = (id) => { const s = bul(id); return !!(s && s.offsetParent !== null); };

  async function yukle(yenile) {
    if (!bul('borsaPanel') || yukleniyor) return;   // F5: panel Botlar › <bot> › Hesap'ta
    yukleniyor = true;
    try {
      const v = await AG.api.hesaplar(!!yenile);
      if (!v || !v.success) throw new Error((v && v.error) || 'yanıt yok');
      son = v;
      sekmelerCiz(v);
      const pan = bul('borsaPanel');
      const h = seciliHesap(v);
      // Geçmiş görünümü 15 sn tazelemede yeniden istenmez (sayfa ve kaydırma kaçmasın): yalnız sekme değişince ya da elle yenilenince.
      if (pan && (gorunum[h] !== 'gecmis' || pan.dataset.hesap !== h || yenile)) { pan.dataset.hesap = h; panelCiz(pan, v, h, {}); }
      const ar = bul('arsivKagitKok');
      const motor = (v.baglantilar || []).some(b => b.hesap === 'kagit-motor');
      if (ar && !motor) doldur(ar, [el('p', { class: 'hint mb-0', text: 'Kâğıt test motoru bu bilgisayarda çalışmıyor.' })]);
      else if (ar && (gorunum['kagit-motor'] !== 'gecmis' || !ar.dataset.kuruldu)) { ar.dataset.kuruldu = '1'; panelCiz(ar, v, 'kagit-motor', { arsiv: true }); }
      dokumCiz();
    } catch (e) {
      const k = bul('borsaPanel');
      if (k) doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Borsa hesapları okunamadı', yeniden: () => yukle(true) })]);
    } finally { yukleniyor = false; }
  }

  /** F5: Botlar › <bot> › Hesap görünümü açık mı (eski Borsa hesapları sayfası). */
  const hesapGorunur = () => gorunurMu('tab-botlar') && !!(AG.pages.botlar && AG.pages.botlar.gorunum && AG.pages.botlar.gorunum() === 'hesap');
  function baslat() {
    if (!bul('borsaPanel')) return;
    doc.addEventListener('ag:rota', (e) => {
      const b = e.detail && e.detail.bolum;
      if ((b === 'tab-botlar' && hesapGorunur()) || b === 'tab-kagit' || b === 'tab-portfoy') global.setTimeout(() => yukle(false), 30);
    });
    if (!zamanlayici) zamanlayici = global.setInterval(() => { if (hesapGorunur() || gorunurMu('tab-kagit')) yukle(false); }, YENILE_MS);
    if (hesapGorunur() || gorunurMu('tab-kagit')) yukle(false);
  }

  AG.pages = AG.pages || {};
  AG.pages.hesaplar = { otuzGunOnce, hesapAdi, hesapTuru, sekmeListesi, zorlaKapanmayaYakin, korumasizlar, bilerekStopsuz, korumaHucresi, emirNe, saglik, baslat, yukle, sec, panelCiz, sekmelerCiz, dokumCiz,
    gorunum, dokum, son: () => son, secili: () => (son ? seciliHesap(son) : secili) };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.hesaplar;
  if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
  else if (doc && doc.readyState) baslat();
})(typeof window !== 'undefined' ? window : globalThis);
