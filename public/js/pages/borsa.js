/**
 * BORSA BAĞLANTISI — Binance USDⓈ-M demo hesap (iç ad testnet) / canlı bağlantısı (`lib/live/`), API anahtarları ve elle emir.
 * 62.7 yerleşim: demo anahtarı + canlı hesap katı → Ayarlar › Borsa (#ayarBorsa); elle emir → Arşiv (#elleEmirKat).
 * Pozisyon/emir tabloları js/pages/hesaplar.js'te (Borsa hesapları, sekme = hesap).
 * ═══════════════════════════════════════════════════════════════════════════
 * Paper motordan AYRI bir yüzey: buradaki her sayı borsadan okunur.
 *
 * Güvenlik akışı:
 *   · canlı bağlantı ve canlı emir kilidi "CANLI" yazılarak onaylanır
 *   · emir göndermek için önce ÖNİZLEME; gönder düğmesi yalnız aynı
 *     parametrelerle geçerli bir önizlemeden sonra açılır
 *   · anahtarlar yalnız YAZILIR; sunucu geri göndermez
 * Tüm DOM `AG.dom.el` ile kurulur — sunucu metni işaretlemeye girmez.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const { el, doldur, bul } = AG.dom;
  const istek = (yol, govde) => AG.api.istek(yol, govde === undefined ? undefined : { govde });

  const BTC = 'BTC/USDT:USDT';
  let sonOnizleme = null;        // { anahtar, gecerli }
  let yenileZamanlayici = null;

  const sayi = (x, b = 2) => (x === null || x === undefined || Number.isNaN(+x) ? '—' : (+x).toLocaleString('tr-TR', { maximumFractionDigits: b, minimumFractionDigits: 0 }));
  // Panel bildirim bileşeni (js/core/bildirim.js); yoksa tarayıcı yerlisine düşer.
  const TUR = { success: 'ok', error: 'hata', warning: 'uyari', info: 'bilgi' };
  const bildir = (metin, tur) => (AG.bildir ? AG.bildir(metin, TUR[tur] || 'bilgi') : global.alert(metin));
  const onayla = async (metin) => (AG.onayla
    ? AG.onayla({ baslik: 'Borsa işlemi', metin, onay: 'Evet, devam', tehlikeli: true })
    : global.confirm(metin));

  const yardim = (k) => (AG.sozluk ? AG.sozluk.yardim(k) : null);

  /** Denetim A-31: tek kullanıcı terimi "demo hesap" (iç ortam adı testnet ekranda yazılmaz). */
  function rozet(mod) {
    const sinif = { live: 'badge badge-danger', testnet: 'badge badge-warning', paper: 'badge' }[mod] || 'badge';
    const ad = { live: 'CANLI', testnet: 'DEMO HESAP', paper: 'bağlı değil' }[mod] || mod;
    return el('span', { class: sinif, text: ad });
  }

  /** [etiket, değer, sözlük anahtarı?] satırları. */
  function satirlar(cifti) {
    return el('dl', { class: 'kv-list' }, cifti.flatMap(([k, v, terim]) => [el('dt', null, [el('span', { text: k }), terim ? yardim(terim) : null]),
      el('dd', null, [typeof v === 'string' || typeof v === 'number' ? el('span', { text: String(v) }) : v])]));
  }

  function dugme(metin, sinif, tik) {
    return el('button', { type: 'button', class: `btn ${sinif || 'btn-secondary'}`, text: metin, onclick: tik });
  }

  async function eylem(dugmeEl, fn) {
    if (dugmeEl) AG.dom.mesgul && AG.dom.mesgul(dugmeEl, '…');
    try { await fn(); } catch (e) { bildir(e.message, 'error'); }
    finally { if (dugmeEl && AG.dom.hazir) AG.dom.hazir(dugmeEl); await yenile(); if (AG.pages.hesaplar) AG.pages.hesaplar.yukle(true); }
  }

  // ── Elle emir bağlantısı (Gelişmiş katı; denetim A-30) ─────────────────
  function durumCiz(s) {
    const y = s.yurutucu;
    const kutu = bul('exchangeStatusBox');
    const DURUM_AD = { AKTIF: 'AKTİF', DURDURULDU: 'DURDURULDU', BAGLI_DEGIL: 'bağlı değil' };
    const m = y.sonMutabakat;
    if (kutu) {
      const durumRozet = el('span', { class: `badge ${y.durum === 'AKTIF' ? 'badge-success' : y.durum === 'DURDURULDU' ? 'badge-danger' : ''}`, text: DURUM_AD[y.durum] || y.durum });
      const dugmeler = [];
      if (!y.ortam) {
        // Ö16 / A-01: burada YALNIZ demo hesap; canlı hesap bağlantısı ayrı katta (canliCiz) ve sunucuda kapalı.
        dugmeler.push(dugme('Demo hesaba bağlan', 'btn-primary', (e) => eylem(e.currentTarget, async () => {
          const r = await istek('/api/exchange/connect', { ortam: 'testnet' });
          if (!r.success) throw new Error(r.error);
          bildir('Demo hesaba bağlandı', 'success');
        })));
      } else {
        dugmeler.push(dugme('Borsayla karşılaştır', 'btn-secondary', (e) => eylem(e.currentTarget, async () => {
          const r = await istek('/api/exchange/reconcile', {});
          if (!r.success) throw new Error(r.error);
        })));
        if (y.ortam === 'live') {
          dugmeler.push(y.kilitAcik
            ? dugme('Emir kilidini KAPAT', 'btn-secondary', (e) => eylem(e.currentTarget, () => istek('/api/exchange/arm', { kapat: true })))
            : dugme('Emir kilidini aç', 'btn-danger', (e) => eylem(e.currentTarget, async () => {
              const v = await AG.onayla({ baslik: 'Canlı emir kilidi', metin: 'Canlı hesapta emir gönderilebilecek. Onay için CANLI yazın.', onay: 'Kilidi aç', tehlikeli: true,
                alanlar: [{ ad: 'onay', etiket: 'Onay: CANLI yazın', ipucu: 'CANLI', dogrula: (x) => x.trim() === 'CANLI' }] });
              if (!v) return;
              const r = await istek('/api/exchange/arm', { onay: 'CANLI' });
              if (!r.success) throw new Error(r.error);
            })));
        }
        dugmeler.push(dugme('Bağlantıyı kes', 'btn-secondary', (e) => eylem(e.currentTarget, () => istek('/api/exchange/disconnect', {}))));
        dugmeler.push(dugme('ACİL DURDUR', 'btn-danger', (e) => eylem(e.currentTarget, async () => {
          if (!(await onayla('Bizim tüm açık emirlerimiz iptal edilecek ve TÜM pozisyonlar piyasa emriyle kapatılacak. Devam?'))) return;
          const r = await istek('/api/exchange/kill', {});
          if (!r.success) throw new Error(r.error);
          bildir(`Acil durdurma: ${r.rapor.iptal} emir iptal, ${r.rapor.kapatilan.length} pozisyon kapatma emri${r.rapor.hatalar.length ? ' — HATALAR: ' + r.rapor.hatalar.join('; ') : ''}`, r.rapor.hatalar.length ? 'error' : 'warning');
        })));
      }

      const izin = y.izinler
        ? `para çekme ${y.izinler.enableWithdrawals ? 'AÇIK ⚠' : 'kapalı'} · IP kısıtı ${y.izinler.ipRestrict ? 'var' : 'YOK ⚠'}`
        : (y.ortam === 'testnet' ? 'demo hesapta sorgulanamaz' : '—');
      const sat = [
        ['Durum', durumRozet],
        y.durmaSebebi ? ['Neden durdu', y.durmaSebebi] : null,
        ['Pozisyon modu', y.pozisyonModu === 'oneway' ? 'tek yön' : y.pozisyonModu === 'hedge' ? 'iki yön (hedge)' : (y.pozisyonModu || '—'), 'pozisyonModu'],
        // Canlı emir kilidi yalnız canlı hesap bağlantısında anlamlı — demo/kâğıtta satır yok.
        y.ortam === 'live' ? ['Canlı emir kilidi', y.kilitAcik ? 'AÇIK' : 'kapalı', 'canliEmirKilidi'] : null,
        y.ortam ? ['Anahtar izinleri', izin] : null,
        ['Emir üst sınırı', `tek emir en çok ${y.tavanlar.emir} USDT · sembol başına en çok ${y.tavanlar.pozisyon} USDT`, 'tavan'],
        y.ortam ? ['Saat farkı (bilgisayar ↔ borsa)', y.saatOlcum && y.saatOlcum.fark != null ? `${y.saatOlcum.fark > 0 ? '+' : ''}${Math.round(y.saatOlcum.fark)} ms` : '—', 'saatFarki'] : null,
        y.ortam ? ['Son karşılaştırma (kayıt ↔ borsa)', m ? `${new Date(m.zaman).toLocaleTimeString('tr-TR')} · ${m.hata ? 'HATA: ' + m.hata : `${m.cozulemeyen.length ? `${m.cozulemeyen.length} uyuşmazlık` : 'uyumlu'}${m.yabanciEmir ? ` · bize ait olmayan emir ${m.yabanciEmir}` : ''}`}` : '—', 'mutabakat'] : null
      ].filter(Boolean);
      doldur(kutu, [
        el('div', { class: 'row-between' }, [el('h3', { text: 'Elle emir bağlantısı' }), rozet(s.exchangeMode)]),
        el('p', { class: 'hint hint-sm mb-3', text: 'Botlardan bağımsız, elle tek emir vermek için demo hesap bağlantısı (Arşiv: artık günlük kullanımda değil). Kairos ve Tao kendi bağlantılarını kullanır; buradan bağlanmak gerekmez.' }),
        satirlar(sat),
        el('div', { class: 'row gap-2 wrap' }, dugmeler),
      ]);
    }
    canliCiz(s);
    // Donchian trend botu kartı Arşiv'de (Pusula P1 — kod silinmedi, kart taşındı).
    const arsiv = bul('arsivDonchianKutu');
    if (arsiv) doldur(arsiv, [botKutusu(s)]);
  }

  /**
   * CANLI HESAP (karar Ö16, denetim A-01): katlı "Gelişmiş — canlı hesap" bölümü. Sunucu `canliIzin` vermedikçe
   * (ayar dosyasında — 68.0'dan beri veri klasöründeki ayarlar.json, eski kurulumda kökteki config.json — bilinçli
   * `canliIzin: true` yok) bağlan düğmesi PASİF ve sunucu 403 verir. Bayrak Ayarlar sayfasından yazılamaz (lib/guvenlik.js
   * PANELDEN_YAZILMAZ); 68.4: ekrandaki yazı da eski "config.json" yerine bunu söyler. Canlı anahtar alanları
   * da yalnız burada (demo anahtarları ayrı katta).
   */
  function canliCiz(s) {
    const kutu = bul('canliParaKutu');
    if (!kutu) return;
    const izin = s.canliIzin === true;
    const bagliCanli = s.yurutucu && s.yurutucu.ortam === 'live';
    const bagla = dugme('Canlı hesaba bağlan', 'btn-danger', (e) => eylem(e.currentTarget, async () => {
      const v = await AG.onayla({ baslik: 'CANLI HESAP', metin: 'Canlı Binance hesabına bağlanılacak. Onay için CANLI yazın.', onay: 'Bağlan', tehlikeli: true,
        alanlar: [{ ad: 'onay', etiket: 'Onay: CANLI yazın', ipucu: 'CANLI', dogrula: (x) => x.trim() === 'CANLI' }] });
      if (!v) return;
      const r = await istek('/api/exchange/connect', { ortam: 'live', onay: 'CANLI' });
      if (!r.success) throw new Error(r.error);
      bildir('Canlı hesaba bağlandı — emir kilidi KAPALI', 'warning');
    }));
    bagla.id = 'btnCanliBaglan';
    if (!izin || bagliCanli) { bagla.disabled = true; bagla.setAttribute('title', izin ? 'Zaten canlı hesaba bağlı' : 'Canlı hesap modu kapalı'); }
    const kayitli = !!(s.anahtarlar && s.anahtarlar.live);
    if (kutu.dataset.kuruldu) {
      const d = bul('canliParaDurum'); if (d) doldur(d, [el('span', { text: `Canlı anahtar: ${kayitli ? 'kayıtlı ✓' : 'yok'}` })]);
      const eski = bul('btnCanliBaglan'); if (eski && eski.parentNode) eski.parentNode.replaceChild(bagla, eski);
      return;
    }
    kutu.dataset.kuruldu = '1';
    const alan = (id, etiket) => el('label', { class: 'form-group' }, [el('span', { text: etiket }),
      el('input', { id, type: 'password', class: 'form-control', autocomplete: 'off', spellcheck: 'false' })]);
    doldur(kutu, [
      el('p', { class: `mb-3 ${izin ? 'tone-danger' : 'tone-warning'}`, text: izin
        ? 'Canlı hesap modu bu bilgisayarda AÇIK: veri klasöründeki ayarlar.json dosyasına (henüz ayar kaydı yapılmamış eski kurulumda kökteki config.json\'a) elle canliIzin: true yazılmış (Ayarlar sayfasından açılıp kapanmaz; kapatmak için o satırı dosyadan silip Pusula\'yı yeniden başlatın). Bağlanmadan önce canlı hesap şartlarını (G1–G9) yeniden okuyun.'
        : 'Canlı hesap modu bilinçli olarak kapalı. En erken 5 Ocak 2027\'de, canlı hesap şartlarının (G1–G9) hepsi sağlanınca açılır; o zamana kadar bu bölüm yalnız bilgi içindir.' }),
      el('div', { id: 'canliParaDurum', class: 'mb-2' }, [el('span', { text: `Canlı anahtar: ${kayitli ? 'kayıtlı ✓' : 'yok'}` })]),
      el('div', { class: 'grid-2' }, [alan('inpLiveKey', 'Canlı API anahtarı'), alan('inpLiveSecret', 'Canlı gizli anahtar')]),
      el('div', { class: 'row gap-2 wrap' }, [
        dugme('Canlı anahtarı kaydet', 'btn-secondary', (e) => eylem(e.currentTarget, async () => {
          const govde = {};
          const k = bul('inpLiveKey').value.trim(), g = bul('inpLiveSecret').value.trim();
          if (k) govde.apiKey = k; if (g) govde.apiSecret = g;
          if (!Object.keys(govde).length) throw new Error('boş — kaydedilecek anahtar yok');
          const r = await istek('/api/secrets', govde);
          if (!r.success) throw new Error(r.error);
          ['inpLiveKey', 'inpLiveSecret'].forEach(id => { bul(id).value = ''; });
          bildir('Canlı anahtar kaydedildi (bağlantı açılmadı)', 'success');
        })),
        bagla
      ])
    ]);
  }

  /**
   * Arşiv › Donchian trend botu — SALT OKUNUR (denetim A-05): emekli bot ve BTC al-tut'u yenmedi; "Botu başlat" yok.
   * Yalnız durum + "Kuru hesapla" (emir vermez). Bot bir şekilde çalışıyorsa durdurmak için "Botu durdur" görünür.
   */
  function botKutusu(s) {
    const b = s.bot;
    const r = b.sonRapor;
    const bagli = !!s.yurutucu.ortam;
    const dugmeler = [
      dugme('Kuru hesapla (emir vermez)', 'btn-secondary', (e) => eylem(e.currentTarget, async () => {
        const x = await istek('/api/exchange/bot', { eylem: 'kuru' }); if (!x.success) throw new Error(x.error);
      }))
    ];
    if (!bagli) dugmeler[0].disabled = true;
    if (b.calisiyor) dugmeler.push(dugme('Botu durdur', 'btn-secondary', (e) => eylem(e.currentTarget, () => istek('/api/exchange/bot', { eylem: 'durdur' }))));
    return el('div', { class: 'sunken-panel mt-3' }, [
      el('h4', { text: `Donchian trend botu — ${b.ayar.symbol} (emekli, salt okunur)` }),
      el('p', { class: 'text-muted', text: 'Artık kullanılmıyor: BTC al-tut\'u ön kayıtlı ölçütlerle yenemedi, bu yüzden başlatılamaz. Günde bir kez hedef pozisyonu hesaplayan eski bot; kayıtları incelemek için duruyor.' }),
      satirlar([
        ['Durum', b.calisiyor ? 'çalışıyor' : 'durdu'],
        ['Sermaye tavanı', `${b.ayar.sermayeTavani} USDT`],
        ['Son işlem günü', b.sonGun || '—'],
        ['Son hesap', r ? `${r.gun}: ${r.acikAltModel}/${r.altModel} açık · maruziyet ${sayi(r.maruziyet, 3)}x · hedef ${sayi(r.hedefNominal)} USDT (${sayi(r.hedefMiktar, 6)})${r.kuru ? ' · deneme' : ''}` : '—'],
      ]),
      el('div', { class: 'row gap-2 wrap' }, dugmeler),
    ]);
  }

  /**
   * Arşiv › Kalkan botu — SALT OKUNUR kart (karar Ö17, denetim A-16): durum, özsermaye, son karar; başlat düğmesi YOK.
   * Bot (eski bir ayarla) çalışıyorsa görünür olsun ve durdurulabilsin diye yalnız "Durdur" çıkar.
   */
  async function kalkanCiz() {
    const kutu = bul('arsivKalkanKutu');
    if (!kutu) return;
    let r;
    try { r = await istek('/api/kalkan/durum'); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(kutu, [el('p', { class: 'hint mb-0', text: `Kalkan durumu alınamadı: ${(r && r.error) || 'bilinmeyen hata'}` })]); return; }
    const k = r.kalkan || {}, h = r.hesap && !r.hesap.hata ? r.hesap : null;
    const oz = h && h.bakiye && Number.isFinite(+h.bakiye.toplam) ? `${sayi(h.bakiye.toplam, 0)} USDT (kâğıt)` : 'kâğıt borsaya bağlı değil';
    const sr = k.sonRapor;
    const dugmeler = k.calisiyor ? [dugme('Durdur', 'btn-secondary', (e) => eylem(e.currentTarget, async () => {
      if (!(await onayla('Kalkan botu durdurulsun mu? Pozisyonlar kapatılmaz (yalnız kâğıt hesap).'))) return;
      const x = await istek('/api/kalkan/durdur', {}); if (!x.success) throw new Error(x.error); kalkanCiz();
    }))] : [];
    doldur(kutu, [el('div', { class: 'sunken-panel mt-3' }, [
      el('h4', { text: 'Kalkan botu (B Kalkan, yalnız kâğıt — salt okunur)' }),
      el('p', { class: 'text-muted', text: 'Ayrı bot olarak emekli: Kairos ve Tao, Kalkan kolunu zaten içeriyor. Kart yalnız durumu gösterir; başlatılamaz.' }),
      satirlar([
        ['Durum', k.engel ? `durduruldu — ${k.engel}` : k.calisiyor ? 'çalışıyor' : 'durdu'],
        ['Özsermaye', oz],
        ['Son karar günü', k.sonGun || (sr && sr.gun) || '—'],
        ['Sermaye tavanı', k.sermayeTavani != null ? `${sayi(k.sermayeTavani, 0)} USDT` : '—']
      ]),
      dugmeler.length ? el('div', { class: 'row gap-2 wrap' }, dugmeler) : null
    ])]);
  }

  // ── Demo hesap anahtarları (canlı anahtar ayrı katta: canliCiz) ────────
  function anahtarCiz(s) {
    const kutu = bul('exchangeKeysBox');
    if (!kutu || kutu.dataset.kuruldu) { if (kutu) guncelleAnahtarDurumu(s); return; }
    kutu.dataset.kuruldu = '1';
    const alan = (id, etiket) => el('label', { class: 'form-group' }, [el('span', { text: etiket }),
      el('input', { id, type: 'password', class: 'form-control', autocomplete: 'off', spellcheck: 'false' })]);
    doldur(kutu, [
      el('p', { class: 'text-muted' }, [el('span', { text: 'Anahtarlar sunucuda data/secrets.json\'a yazılır, geri okunmaz. Binance Demo Trading hesabından alınır (canlı hesabın anahtarı demo\'da çalışmaz). API Management: yalnız "Enable Futures" açık, "Enable Withdrawals" KAPALI, IP kısıtı açık olmalı.' }), yardim('testnet')]),
      el('div', { id: 'exchangeKeysDurum', class: 'mb-2' }),
      el('div', { class: 'grid-2' }, [alan('inpTestnetKey', 'Demo hesap API anahtarı'), alan('inpTestnetSecret', 'Demo hesap gizli anahtarı')]),
      el('div', { class: 'row gap-2' }, [dugme('Anahtarları kaydet', 'btn-primary', (e) => eylem(e.currentTarget, async () => {
        const govde = {};
        const oku = (id, k) => { const v = bul(id).value.trim(); if (v) govde[k] = v; };
        oku('inpTestnetKey', 'testnetApiKey'); oku('inpTestnetSecret', 'testnetApiSecret');
        if (!Object.keys(govde).length) throw new Error('boş — kaydedilecek anahtar yok');
        const r = await istek('/api/secrets', govde);
        if (!r.success) throw new Error(r.error);
        ['inpTestnetKey', 'inpTestnetSecret'].forEach(id => { bul(id).value = ''; });
        bildir('Anahtarlar kaydedildi', 'success');
      }))]),
    ]);
    guncelleAnahtarDurumu(s);
  }

  function guncelleAnahtarDurumu(s) {
    const d = bul('exchangeKeysDurum');
    if (d) doldur(d, [el('span', { text: `demo hesap anahtarı: ${s.anahtarlar.testnet ? 'kayıtlı ✓' : 'yok'}` })]);
  }

  // Hesap bakiyesi, pozisyonlar ve açık emirler Borsa hesapları ekranında (js/pages/hesaplar.js, GET /api/hesaplar).
  // Bu dosya yalnız bağlantı, anahtarlar ve elle emir.

  // ── Emir önizleme / gönderme ────────────────────────────────────────────
  function emirFormuKur() {
    const kutu = bul('exchangePreviewBox');
    if (!kutu || kutu.dataset.kuruldu) return;
    kutu.dataset.kuruldu = '1';
    const secim = (id, secenekler) => el('select', { id, class: 'form-control' }, secenekler.map(([v, t]) => el('option', { value: v, text: t })));
    const girdi = (id, props) => el('input', { id, class: 'form-control', ...props });
    const etiket = (metin, cocuk) => el('label', { class: 'form-group' }, [el('span', { text: metin }), cocuk]);
    const sonuc = el('div', { id: 'exchangePreviewResult', class: 'mt-2' });
    const gonder = dugme('Emri gönder', 'btn-danger', (e) => eylem(e.currentTarget, async () => {
      const g = formOku();
      if (!sonOnizleme || sonOnizleme.anahtar !== JSON.stringify(g) || !sonOnizleme.gecerli) throw new Error('önce bu parametrelerle geçerli bir önizleme yapın');
      if (!(await onayla(`${g.side.toUpperCase()} ${g.amount} ${g.symbol} ${g.type}${g.price ? ' @ ' + g.price : ''} gönderilsin mi?`))) return;
      const r = await istek('/api/exchange/order', g);
      sonOnizleme = null; gonder.disabled = true;
      if (!r.success) throw new Error(r.error);
      bildir(`Emir ${r.sonuc.emir.id}: ${r.sonuc.emir.durum}`, 'success');
    }));
    gonder.id = 'btnExchangeSend';
    gonder.disabled = true;

    doldur(kutu, [
      el('p', { class: 'hint hint-sm mb-3' }, [el('span', { text: 'Botlardan bağımsız tek emir — yalnız yukarıdaki borsa bağlantısından gider.' }), AG.sozluk ? AG.sozluk.yardim('elleEmir') : null]),
      el('div', { class: 'grid-3' }, [
        etiket('Sembol', girdi('exSymbol', { value: BTC })),
        etiket('Yön', secim('exSide', [['buy', 'Al (long)'], ['sell', 'Sat (short)']])),
        etiket('Tür', secim('exType', [['market', 'Piyasa'], ['limit', 'Limit']])),
        etiket('Miktar (baz)', girdi('exAmount', { type: 'number', step: 'any', min: '0', value: '0.001' })),
        etiket('Limit fiyatı', girdi('exPrice', { type: 'number', step: 'any', min: '0' })),
        el('label', { class: 'check-label' }, [el('input', { id: 'exReduceOnly', type: 'checkbox' }), el('span', { text: 'Yalnız azalt (reduceOnly)' })]),
      ]),
      el('div', { class: 'row gap-2' }, [dugme('Önizle', 'btn-primary', (e) => eylem(e.currentTarget, async () => {
        const g = formOku();
        const r = await istek('/api/exchange/preview', g);
        if (!r.success) throw new Error(r.error);
        sonOnizleme = { anahtar: JSON.stringify(g), gecerli: r.onizleme.gecerli };
        gonder.disabled = !r.onizleme.gecerli;
        onizlemeCiz(r.onizleme);
      })), gonder]),
      sonuc,
    ]);
    // Parametre değişince eski önizleme geçersiz.
    ['exSymbol', 'exSide', 'exType', 'exAmount', 'exPrice', 'exReduceOnly'].forEach(id => bul(id).addEventListener('input', () => { sonOnizleme = null; gonder.disabled = true; }));
  }

  function formOku() {
    const g = { symbol: bul('exSymbol').value.trim(), side: bul('exSide').value, type: bul('exType').value,
      amount: +bul('exAmount').value, reduceOnly: bul('exReduceOnly').checked };
    if (g.type === 'limit') g.price = +bul('exPrice').value;
    return g;
  }

  function onizlemeCiz(o) {
    const n = bul('exchangePreviewResult');
    doldur(n, [
      satirlar([
        ['Sonuç', el('span', { class: o.gecerli ? 'text-pos' : 'text-neg', text: o.gecerli ? 'GÖNDERİLEBİLİR' : 'GÖNDERİLEMEZ' })],
        ['Düzeltilmiş emir', `${o.emir.side} ${o.emir.amount}${o.emir.price ? ' @ ' + o.emir.price : ''} ${o.emir.type}${o.emir.reduceOnly ? ' · yalnız azalt' : ''}`],
        ['Mark fiyatı', sayi(o.markFiyati)],
        ['Nominal', o.nominal != null ? `${sayi(o.nominal)} USDT` : '—'],
        ['Tahmini ücret', o.tahminiUcret != null ? `${sayi(o.tahminiUcret, 4)} USDT` : '—'],
        ['Kapı', o.kapi && o.kapi.engel ? o.kapi.engel : 'açık'],
      ]),
      ...(o.hatalar || []).map(h => el('p', { class: 'text-neg', text: `${h.kod}: ${h.mesaj}` })),
      ...(o.uyarilar || []).map(u => el('p', { class: 'text-warn', text: u })),
    ]);
  }

  // ── Yenileme ────────────────────────────────────────────────────────────
  async function yenile() {
    let s;
    try { s = await istek('/api/exchange/status'); } catch (e) { return; }
    if (!s || !s.success) return;
    durumCiz(s);
    anahtarCiz(s);
    emirFormuKur();
    if (gorunurMu('tab-arsiv')) kalkanCiz();
  }

  // Arşiv (elle emir, Donchian kartı) ya da Ayarlar (anahtar, canlı hesap) açıkken 10 sn'de bir tazelenir.
  function gorunurMu(tek) { return (tek ? [tek] : ['tab-botlar', 'tab-arsiv', 'tab-settings']).some(id => { const sek = bul(id); return !!(sek && sek.offsetParent !== null); }); }

  function baslat() {
    if (!bul('tab-arsiv') && !bul('tab-settings')) return;   // F5: Borsa hesapları bölümü kalktı (Botlar › Hesap)
    yenile();
    if (!yenileZamanlayici) yenileZamanlayici = global.setInterval(() => { if (gorunurMu()) yenile(); }, 10000);
    global.document.addEventListener('ag:rota', (e) => {
      const b = e.detail && e.detail.bolum;
      if (b === 'tab-botlar' || b === 'tab-arsiv' || b === 'tab-settings') global.setTimeout(yenile, 50);
      if (b === 'tab-arsiv') global.setTimeout(kalkanCiz, 60);
    });
  }

  AG.pages = AG.pages || {};
  AG.pages.borsa = { baslat, yenile, kalkanCiz, canliCiz, botKutusu };
  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', baslat);
  else baslat();
})(typeof window !== 'undefined' ? window : globalThis);
