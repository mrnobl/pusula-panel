/**
 * BOTLAR — Hücum / Denge kartları (PLAN-PANEL-PUSULA §2 "Bot ne yapıyor?", P2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 62.6 (kullanıcıyla taslak 1–2): SEKME = BOT. #botSekmeler'de Hücum / Denge; seçili botun kartı tam genişlik:
 *   başlık   simge · ad · büyük durum · mod · kural (sade) · "bu gece" · yalnız Durdur/Başlat + Acil fren
 *   sayılar  hesap değeri · başlangıçtan · BTC al-tut aynı dönem · simülasyona göre · en derin düşüş · BTC trendi
 *   grafik   Canlı (hesap ↔ simülasyon ↔ BTC, Chart.js kalıcı tuval) ↔ Geçmiş (GET /api/tasarimci/gecmis/b-<ad>, AG.grafik.ana)
 *   para nerede (BTC / coin sepeti / nakit) + coin bazında K/Z (AG.grafik.cubuk) · aylık getiri · künye (katlı)
 * Altında (index.html) o botun coin grafiği + işlemleri (bindirmeIslem.botSec). Mod, canlı hesap emir onayı, para yatırdım,
 * küçük hesap kipi, şimdi çalıştır, deneme / borsayla karşılaştır / acil freni dene: Ayarlar › Botlar (#ayarBotlar, ayarlarCiz).
 * Sade terimler: özsermaye → hesap değeri, kol → coin sepeti, gölge → simülasyon, BTC payı → BTC oranı, felaket stopu →
 * koruma stopu, marj → teminat, hesap kesicisi → hesap koruması, küçük sermaye → küçük hesap kipi.
 *
 * (Eski düzen notu) P1'e kadar iki bot 11 sütunlu bir tablonun iki satırıydı (~10 düğme satır
 * içinde; 1400 px'te açıklama ve düğmeler kesiliyordu). Artık bot başına KART:
 *
 *   başlık  ad + kısa açıklama · mod (kâğıt/demo) · durum (sade dil) ·
 *           "Eylemler" menüsü (başlat/durdur, şimdi çalıştır, deneme hesabı,
 *           borsayla karşılaştır, mod, küçük sermaye, acil fren denemesi) ·
 *           ACİL FREN ayrı, kırmızı ve onaylı
 *   bant    durdurulduysa: neden + "Engeli kaldır" (kırmızı, onaylı) — onay bekliyor
 *   sayılar özsermaye · BTC trend kuralı (açık/kapalı) · BTC payı · gölgeye göre sapma
 *   grafik  özsermaye ↔ gölge ↔ BTC (GET /api/bindirme/:ad/grafik?mumsuz=1, 5 dk önbellek)
 *   künye   kol payları, felaket stopu, marj, son karar, son çalışma, açık pozisyon …
 *
 * Kartın üst ve alt parçası her tazelemede (en çok 15 sn'de bir, app.js TICK) yeniden
 * çizilir; grafik kutusu KALICIDIR (titremesin, Chart.js örneği yeniden kurulmasın).
 * Açık "Eylemler" menüsü tazelemede açık kalır.
 *
 * Araştırma modu: kartlardaki bütün düğme ve seçiciler `#botKartlari button/select`
 * ile kilitlenir (js/pages/kabuk.js KILITLI). Sade metinler js/pages/botDil.js'ten
 * (ana sayfayla aynı dil); terim açıklamaları js/core/sozluk.js'ten.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const { el, doldur, bul } = AG.dom;
  const doc = global.document;
  const D = () => AG.botDil;

  const ADLAR = ['hucum', 'denge'];
  /** 68.8: Botlar › Portföy botları (js/pages/portfoyBotlari.js) — Ayarlar › Botlar özetinde salt bağlantı satırı. */
  const PORTFOY_BOTLARI = [['m-qqq-m10', 'QQQ M10'], ['m-bist-m10', 'BIST M10'], ['m-837', '837 · QQQ + Hücum']];
  const GRAFIK_MS = 5 * 60000;
  let durumZamani = 0;
  const acikMenu = {};
  const grafikler = {};          // ad → Chart örneği
  const grafikVeri = {};         // ad → { zaman, oz }

  const bildir = (m, t) => AG.bildir(m, t || 'bilgi');
  const yardim = (k) => (AG.sozluk ? AG.sozluk.yardim(k) : null);
  const ton = (t) => D().TON_SINIF[t || ''] || '';
  const bugunStr = () => D().yerelGun();   // yerel gün (denetim A-07; toISOString UTC verirdi)
  /** Araştırma kopyası mı (js/pages/kabuk.js; /api/health → arastirmaModu). */
  const arastirmaMu = () => !!(AG.pages && AG.pages.kabuk && AG.pages.kabuk.arastirmaModu && AG.pages.kabuk.arastirmaModu());

  // ── Eylemler ─────────────────────────────────────────────────────────────
  async function calistir(ad, eylem, dugme, onay) {
    if (onay && !(await AG.onayla({ onay: 'Evet', iptal: 'Vazgeç', ...onay }))) return;
    AG.dom.mesgul(dugme, '…');
    try {
      const r = await AG.api.bindirmeEylem(ad, eylem);
      if (!r.success) throw new Error(r.error);
      if (r.sonuc && r.sonuc.once) bildir(`Acil fren denemesi başarılı: önce ${r.sonuc.once.bizimEmir} emir / ${r.sonuc.once.pozisyon} pozisyon → sonra ${r.sonuc.sonra.bizimEmir} / ${r.sonuc.sonra.pozisyon} · borsayla karşılaştırma: ${r.sonuc.mutabakat}`, 'ok');
      else if (r.mutabakat) bildir(r.mutabakat.engel ? `Borsayla uyuşmuyor — bot durdu: ${r.mutabakat.engel}` : 'Borsayla karşılaştırıldı: uyumlu', r.mutabakat.engel ? 'hata' : 'ok');
      else if (r.rapor && r.rapor.rejim) bildir(`${r.rapor.adGorunen}: ${r.rapor.rejim.icerde ? 'trend açık (BTC tutuluyor)' : 'trend kapalı (USDT)'} · BTC ${r.rapor.btc.islem ? r.rapor.btc.islem.yon : (r.rapor.btc.sebep ? r.rapor.btc.sebep + ' (plan)' : 'değişmedi')}`, 'ok');
      else bildir('Tamam', 'ok');
    } catch (e) {
      bildir(`İşlem yapılamadı: ${e.message}`, 'hata');
    } finally {
      AG.dom.hazir(dugme);
      yukle(true);
    }
  }

  async function modDegistir(ad, mod) {
    const ADI = { kagit: 'kâğıt', demo: 'demo', canli: 'CANLI HESAP' };
    if (mod === 'canli') {
      const v = await AG.onayla({ baslik: 'Mod: CANLI HESAP', onay: 'Canlı hesaba geç', iptal: 'Vazgeç', tehlikeli: true,
        metin: 'Bot Binance GERÇEK hesabınızda çalışacak (BTC ayağı spot BTC, vadeli teminat). Geçiş botu başlatmaz: ardından "Canlı hesap emir onayı" (CANLI) ve Başlat gerekir. Kâğıt ve demo kayıtları ayrı dizinlerde korunur.\nOnay için CANLI HESAP yazın.',
        alanlar: [{ ad: 'onay', etiket: 'Onay: CANLI HESAP yazın', ipucu: 'CANLI HESAP', dogrula: (s) => s.trim().toLocaleUpperCase('tr-TR') === 'CANLI HESAP' }] });
      if (!v) { yukle(true); return; }
      try {
        const r = await AG.api.bindirmeMod(ad, mod, v.onay);
        if (!r.success) throw new Error(r.error);
        bildir('Mod: CANLI HESAP — bot durmuş halde; emir onayı ve Başlat bekleniyor', 'ok');
      } catch (e) { bildir(`Mod değişmedi: ${e.message}`, 'hata'); }
      finally { yukle(true); }
      return;
    }
    const metin = mod === 'demo'
      ? 'Bot Binance Demo Trading hesabında çalışacak (Hesaplar ekranındaki demo hesap anahtarı). Demo hesapta BTC payı vadeli işlemde alım (LONG) olarak tutulur; canlı hesapta spot BTC olur. Kâğıt hesabın durumu ayrı dizinde korunur.'
      : 'Bot kâğıt hesaba döner (gerçek emir yok). Demo hesaptaki pozisyonlar KAPATILMAZ — gerekirse önce demo modunda acil fren.';
    if (!(await AG.onayla({ baslik: `Mod: ${ADI[mod]}`, metin, onay: 'Evet', iptal: 'Vazgeç' }))) { yukle(true); return; }
    try {
      const r = await AG.api.bindirmeMod(ad, mod);
      if (!r.success) throw new Error(r.error);
      bildir(`Mod: ${ADI[mod]}`, 'ok');
    } catch (e) { bildir(`Mod değişmedi: ${e.message}`, 'hata'); }
    finally { yukle(true); }
  }

  /** C1/K1: canlı hesap emir onayı (CANLI yazarak, kalıcı) ya da kaldırma. */
  async function canliOnay(ad, d, kapat, dugme) {
    const b = d.bot;
    let govde = { kapat: true };
    if (!kapat) {
      const v = await AG.onayla({ baslik: `${b.adGorunen}: canlı hesap emir onayı`, onay: 'Onayla', iptal: 'Vazgeç', tehlikeli: true,
        metin: 'Bot canlı hesapta pozisyon açan emir verebilecek. Onay kalıcıdır (yeniden başlatmada kalkmaz); acil durdurma, kesin borsa hatası ya da "Emir onayını kaldır" kaldırır. Tavanlar onay anındaki değerlerdir; büyütülürse yeniden onay gerekir.\nOnay için CANLI yazın.',
        alanlar: [{ ad: 'onay', etiket: 'Onay: CANLI yazın', ipucu: 'CANLI', dogrula: (s) => s.trim().toUpperCase() === 'CANLI' }] });
      if (!v) return;
      govde = { onay: v.onay };
    }
    AG.dom.mesgul(dugme, '…');
    try {
      const r = await AG.api.bindirmeCanliOnay(ad, govde);
      if (!r.success) throw new Error(r.error);
      bildir(kapat ? 'Canlı hesap emir onayı kaldırıldı — bot pozisyon açan emir vermez' : 'Canlı hesap emir onayı verildi', 'ok');
    } catch (e) { bildir(`Yapılamadı: ${e.message}`, 'hata'); }
    finally { AG.dom.hazir(dugme); yukle(true); }
  }

  /**
   * 68.8 KÂĞIT HESABI SIFIRLA (TEMİZ BAŞLA): POST /api/bindirme/:ad/kagit-sifirla { onay: 'SIFIRLA' } — yalnız kâğıt modda ve bot
   * durmuşken (sunucu lib/live/kagitSifirla.js denetler). Eski kayıtlar silinmez: data/live/<bot>-onceki-<zaman> yedeğine taşınır.
   */
  async function kagitSifirla(ad, d, dugme, yeniAyak) {
    const b = d.bot;
    const ayakAd = (x) => x === 'coklu' ? 'çoklu varlık' : 'spot';
    // 68.9 (G7): BTC ayağı yalnız sıfırlamayla değişir — spot ↔ çoklu varlık durumu birbirine taşınmaz.
    const ayakMetni = yeniAyak ? `BTC ayağı: ${ayakAd(b.btcAyak)} → ${ayakAd(yeniAyak)}. ${yeniAyak === 'coklu'
      ? 'Çoklu varlık = canlı hesap tasarımı: BTC spotta alınır, vadeli cüzdana teminat olarak aktarılır (kâğıtta taklit). Canlı hesaba geçiş şartı G7 için en az 14 gün böyle çalışmalı.'
      : 'Spot = varsayılan kâğıt biçimi.'} Biçim değişince hesap sıfırlanmak zorunda.\n` : '';
    const v = await AG.onayla({ baslik: `${b.adGorunen}: kâğıt hesabı sıfırla (temiz başla)`, onay: 'Sıfırla', iptal: 'Vazgeç', tehlikeli: true,
      metin: `${ayakMetni}Kâğıt hesap sıfırdan başlar: sermaye ayarlardaki kâğıt bakiyesi (kagitBakiye, varsayılan 10.000 USDT), pozisyon ve işlem geçmişi boş; ilk çalışmada geçmiş günler telafi edilmez.
Eski kayıtlar SİLİNMEZ — botun klasörü yedek klasöre taşınır (data/live/${ad}-onceki-<tarih>); istenirse oradan incelenir.
Yalnız kâğıt hesap: demo ve canlı hesaba dokunulmaz.` });
    if (!v) { if (yeniAyak) yukle(true); return; }   // seçim kutusu eski değere döner
    const kutu = dugme && dugme.tagName === 'SELECT';   // seçim kutusunun seçenekleri silinmesin: yalnız pasif
    if (kutu) dugme.disabled = true; else AG.dom.mesgul(dugme, '…');
    try {
      const r = await AG.api.bindirmeKagitSifirla(ad, 'SIFIRLA', yeniAyak);
      if (!r.success) throw new Error(r.error);
      bildir(`${b.adGorunen}: kâğıt hesap sıfırlandı — temiz başlangıç (sermaye ${D().para(r.sermaye)} USDT${yeniAyak ? ` · BTC ayağı ${ayakAd(r.btcAyak)}` : ''})${r.yedek ? ` · eski kayıtlar data/live/${r.yedek}` : ''}`, 'ok');
    } catch (e) { bildir(`Sıfırlanmadı: ${e.message}`, 'hata'); }
    finally { if (!kutu) AG.dom.hazir(dugme); grafikVeri[ad] = null; yukle(true); }
  }

  /** O3 (62.1): borsada hesaba para yatırdıktan/çektikten sonra kayıt — bot bunu getiri saymaz. */
  async function sermayeAkisi(ad, d, dugme) {
    const b = d.bot;
    const v = await AG.onayla({ baslik: `${b.adGorunen}: para yatırdım / çektim`, onay: 'Kaydet', iptal: 'Vazgeç',
      metin: 'Binance hesabına para yatırdıysanız ya da çektiyseniz tutarı buraya yazın (yatırma artı, çekme eksi; USDT). Bot parayı taşımaz; yalnız ölçümünü düzeltir — yazmazsanız bot bunu kazanç ya da kayıp sanır ve gereksiz ENGEL koyabilir.',
      alanlar: [
        { ad: 'tutar', etiket: 'Tutar (USDT, + yatırma / − çekme)', ipucu: 'ör. 500 ya da -200', inputmode: 'decimal', dogrula: (s) => /^[-+]?\d+([.,]\d+)?$/.test(s.trim()) && Number(s.trim().replace(',', '.')) !== 0 },
        { ad: 'not', etiket: 'Not (isteğe bağlı)', ipucu: 'ör. Binance P2P yatırma' }
      ] });
    if (!v) return;
    AG.dom.mesgul(dugme, '…');
    try {
      const r = await AG.api.bindirmeSermayeAkisi(ad, Number(v.tutar.trim().replace(',', '.')), v.not || null);
      if (!r.success) throw new Error(r.error);
      bildir(`Kaydedildi: ${r.kayit.tutar > 0 ? '+' : ''}${r.kayit.tutar} USDT`, 'ok');
    } catch (e) { bildir(`Kaydedilemedi: ${e.message}`, 'hata'); }
    finally { AG.dom.hazir(dugme); yukle(true); }
  }

  async function kucukDegistir(ad, secim) {
    try {
      const r = await AG.api.bindirmeKucukSermaye(ad, secim);
      if (!r.success) throw new Error(r.error);
      bildir(`Küçük sermaye uyarlaması: ${secim === 'acik' ? 'açık' : secim === 'kapali' ? 'kapalı' : 'otomatik'}`, 'ok');
    } catch (e) { bildir(`Değişmedi: ${e.message}`, 'hata'); }
    finally { yukle(true); }
  }

  // ── Kart parçaları ───────────────────────────────────────────────────────
  function menuOgesi(metin, aciklama, onclick, sinif) {
    const d = el('button', { type: 'button', class: `eylem-ogesi${sinif ? ' ' + sinif : ''}`, role: 'menuitem' }, [
      el('span', { class: 'eylem-ad', text: metin }), aciklama ? el('span', { class: 'eylem-aciklama', text: aciklama }) : null
    ]);
    d.addEventListener('click', () => { onclick(d); });
    return d;
  }

  /** 62.6: başlıkta yalnız Durdur / Başlat (gerisi Ayarlar › Botlar). */
  function baslatDurdur(ad, d) {
    const b = d.bot;
    const dg = el('button', { type: 'button', class: `btn btn-sm ${b.calisiyor ? 'btn-secondary' : 'btn-primary'}`, id: `btnBotCalis-${ad}` }, [el('span', { text: b.calisiyor ? 'Durdur' : 'Başlat' })]);
    dg.addEventListener('click', () => (b.calisiyor
      ? calistir(ad, 'durdur', dg, { baslik: `${b.adGorunen}: durdurulsun mu?`, metin: 'Günlük çalışma durur. Açık pozisyonlar ve bekleyen emirler kapatılmaz — hepsini kapatmak için Acil fren.', tehlikeli: true })
      : calistir(ad, 'baslat', dg)));
    return dg;
  }

  /** 62.6 Ayarlar › Botlar: iki bot yan yana — hesap türü, emir onayı, para yatırdım, küçük hesap kipi, şimdi çalıştır, kontroller. */
  function ayarHucreleri(ad, d) {
    if (!d || !d.success || !d.bot) return { hata: el('span', { class: 'tone-danger', text: `durum alınamadı${d && d.error ? ': ' + d.error : ''}` }) };
    const b = d.bot, m = d.mod || b.mod, demo = m === 'demo';
    const dugme = (metin, onclick, sinif) => { const x = el('button', { type: 'button', class: `btn btn-sm ${sinif || 'btn-secondary'}` }, [el('span', { text: metin })]); x.addEventListener('click', () => onclick(x)); return x; };
    const modSec = el('select', { class: 'form-control control-sm', 'aria-label': `${b.adGorunen} hesap türü`, id: `selBotMod-${ad}`,
      title: b.calisiyor ? 'Hesap türü yalnız bot durmuşken değişir' : 'kâğıt: gerçek emir yok · demo: Binance Demo Trading hesabı',
      onchange: (ev) => modDegistir(ad, ev.target.value) }, (d.modlar || ['kagit', 'demo']).map(x => {
      const o = el('option', { value: x, text: x === 'demo' ? 'demo' : x === 'canli' ? 'CANLI HESAP' : 'kâğıt' }); if (x === m) o.selected = true; return o;
    }));
    if (b.calisiyor) modSec.disabled = true;
    const kapi = d.canliKapi;
    // 63.0: kapı şartları sunucudan (lib/live/canliKapi.js — bot kodu, dokunulmadı) eski dille gelir; ekranda "canlı hesap".
    const kapiSade = (t) => String(t || '').replace(/ger\u00e7ek parada/g, 'canlı hesapta').replace(/Ger\u00e7ek para/g, 'Canlı hesap').replace(/ger\u00e7ek para/g, 'canlı hesap').replace('Ayarlar › Sağlık sinyali', 'Ayarlar › Bildirimler');
    const kapiNotu = kapi && !kapi.izin ? el('div', { class: `hint hint-sm mb-0 ${m === 'canli' ? 'tone-danger' : ''}`, text: `${m === 'canli' ? 'Canlı hesap kapısı KAPANDI — bot emir vermiyor' : `Canlı hesap: kapalı (en erken ${kapi.enErken})`} — ${kapi.eksikler.slice(0, 2).map(e => kapiSade(e.metin)).join(' · ')}${kapi.eksikler.length > 2 ? ` · +${kapi.eksikler.length - 2} şart` : ''}` }) : null;
    const ks = b.kucukSermaye || {};
    const ksSec = el('select', { class: 'form-control control-sm', 'aria-label': `${b.adGorunen} küçük hesap kipi`, id: `selBotKucuk-${ad}`, onchange: (ev) => kucukDegistir(ad, ev.target.value) },
      [['oto', 'otomatik (< 5000 $)'], ['acik', 'açık'], ['kapali', 'kapalı']].map(([v, t]) => { const o = el('option', { value: v, text: t }); if (v === (ks.secim === true ? 'acik' : ks.secim === false ? 'kapali' : 'oto')) o.selected = true; return o; }));
    if (b.calisiyor) ksSec.disabled = true;
    // 68.9 (G7): kâğıt hesapta BTC ayağı — değişiklik kâğıt hesabı sıfırlar (onaylı); demo her zaman perp, canlı her zaman çoklu.
    const ayakSec = m === 'kagit' ? el('select', { class: 'form-control control-sm', 'aria-label': `${b.adGorunen} BTC ayağı`, id: `selBotAyak-${ad}`,
      title: b.calisiyor ? 'BTC ayağı yalnız bot durmuşken değişir' : 'değiştirmek kâğıt hesabı sıfırlar',
      onchange: (ev) => kagitSifirla(ad, d, ev.target, ev.target.value) },
      [['spot', 'spot (varsayılan)'], ['coklu', 'çoklu varlık (canlı tasarımı)']].map(([v, t]) => { const o = el('option', { value: v, text: t }); if (v === (b.btcAyak === 'coklu' ? 'coklu' : 'spot')) o.selected = true; return o; })) : null;
    if (ayakSec && b.calisiyor) ayakSec.disabled = true;
    const onayli = !!(d.yurutucu && d.yurutucu.kilitAcik);
    return {
      mod: el('div', { class: 'ayar-bot-hucre' }, [modSec, kapiNotu]),
      onay: m === 'canli' ? (onayli ? dugme('Emir onayını kaldır', (x) => canliOnay(ad, d, true, x), 'btn-outline-danger') : dugme('Canlı hesap emir onayı…', (x) => canliOnay(ad, d, false, x), 'btn-outline-danger')) : el('span', { class: 'hint hint-sm mb-0', text: 'yalnız canlı hesapta' }),
      para: m !== 'kagit' ? dugme('Kaydet…', (x) => sermayeAkisi(ad, d, x)) : el('span', { class: 'hint hint-sm mb-0', text: 'kâğıt hesapta gerekmez' }),
      kucuk: ksSec,
      ayak: ayakSec,
      // 68.8: kâğıt hesabı sıfırla (temiz başla) — yalnız kâğıt modda; bot çalışırken pasif (sunucu da 409 verir)
      sifirla: m === 'kagit' ? (() => { const x = dugme('Kâğıt hesabı sıfırla (temiz başla)…', (y) => kagitSifirla(ad, d, y), 'btn-outline-danger'); x.setAttribute('id', `btnBotKagitSifirla-${ad}`); if (b.calisiyor) { x.disabled = true; x.setAttribute('title', 'Önce botu durdurun'); } return x; })() : null,
      calistir: dugme('Şimdi çalıştır', (x) => calistir(ad, 'calistir', x, { baslik: `${b.adGorunen}: günlük çalışma`, tehlikeli: m === 'canli',
        metin: m === 'canli' ? 'CANLI hesapta emir verilecek (BTC + coin sepeti). Canlı hesaptaki para kullanılır.' : demo ? 'Demo hesapta emir verilecek (BTC + coin sepeti). Canlı hesaba dokunulmaz.' : 'Kâğıt hesapta emir verilecek. Gerçek borsaya emir gitmez.' })),
      kontrol: el('div', { class: 'pf-dugmeler' }, [
        dugme('Deneme (emirsiz)', (x) => calistir(ad, 'kuru', x)),
        dugme('Borsayla karşılaştır', (x) => calistir(ad, 'mutabakat', x)),
        demo && !b.calisiyor ? dugme('Acil freni dene', (x) => calistir(ad, 'acil-dene', x, { baslik: `${b.adGorunen}: acil fren denemesi (demo)`, tehlikeli: true,
          metin: 'Demo hesaba küçük, dolmayacak bir limit alış konur; sonra acil fren çalışır: bot emirleri iptal, demo hesaptaki TÜM pozisyonlar piyasadan kapanır. Sonuç doğrulanır.' }), 'btn-outline-danger') : null
      ])
    };
  }

  let sonDurumlar = null;
  /**
   * Yeni panel F5 (K-A): Botlar › <bot> › Yönetim — YALNIZ seçili botun hesap türü, canlı hesap emir onayı, para kaydı, küçük hesap
   * kipi, şimdi çalıştır ve kontrolleri (eskiden Ayarlar › Botlar'da iki bot yan yana). Ayarlar'da salt okunur özet kalır (ayarOzetCiz).
   */
  function ayarlarCiz(ds) {
    const k = bul('ayarBotlar');
    if (!k) return;
    const i = ADLAR.indexOf(secili);
    const adG = (ds && ds[i] && ds[i].bot && ds[i].bot.adGorunen) || (secili === 'hucum' ? 'Hücum' : 'Denge');
    const bas = el('h3', { class: 'card-title mb-3' }, [el('i', { class: 'tone-primary', 'data-lucide': 'settings-2' }), el('span', { text: ` Yönetim — ${adG}` })]);
    if (telefonMu()) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Bot ayarları yalnız sunucudaki panelden değişir (telefon izler ve acil durdurur).' })]); return; }
    if (!ds) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]); return; }
    const h = [ayarHucreleri(secili, ds[i])];
    const satir = (etiket, anahtar, yardimK) => el('tr', null, [el('td', { class: 'pf-sola' }, [el('span', { class: 'fw-semibold', text: etiket }), yardimK ? yardim(yardimK) : null]),
      ...h.map(x => el('td', { class: 'pf-sola' }, [x.hata || x[anahtar]]))]);
    doldur(k, [bas,
      el('p', { class: 'hint mb-3', text: 'Hesap türü ve küçük hesap kipi yalnız bot durmuşken değişir. Durdur/Başlat ve Acil fren Genel görünümünün başında.' }),
      AG.tablo.kutulu({ id: 'tblAyarBotlar', sinif: 'table-dense pf-tablo', basliklar: ['', adG], satirlar: [
        satir('Hesap türü', 'mod', 'kagit'),
        satir('Canlı hesap emir onayı', 'onay', 'gercekPara'),
        satir('Para yatırdım / çektim', 'para'),
        satir('Küçük hesap kipi', 'kucuk', 'kucukSermaye'),
        h[0].ayak ? satir('BTC ayağı (kâğıt)', 'ayak') : null,
        satir('Bugünün kararını şimdi uygula', 'calistir'),
        h[0].sifirla ? satir('Kâğıt hesabı sıfırla', 'sifirla', 'kagit') : null,
        satir('Kontroller', 'kontrol')
      ].filter(Boolean) })
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }
  /** Ayarlar › Botlar (özet): iki botun durumu, hesap türü, küçük hesap kipi, hesap değeri — SALT OKUNUR; yönetim bağlantısı. */
  function ayarOzetCiz(ds) {
    const k = bul('ayarBotOzet');
    if (!k) return;
    const bas = el('h2', { class: 'page-title-sm mb-3' }, [el('i', { class: 'tone-primary', 'data-lucide': 'bot' }), el('span', { text: ' Botlar — özet' })]);
    if (!ds) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]); return; }
    const KS = (b) => { const s = (b.kucukSermaye || {}).secim; return s === true ? 'açık' : s === false ? 'kapalı' : 'otomatik (< 5000 $)'; };
    doldur(k, [bas,
      el('p', { class: 'hint mb-3', text: 'Salt okunur. Hesap türü, para kaydı, şimdi çalıştır ve kontroller her botun kendi sayfasında: Botlar › <bot> › Yönetim.' }),
      AG.tablo.kutulu({ id: 'tblAyarBotOzet', sinif: 'table-dense pf-tablo', basliklar: ['Bot', 'Durum', 'Hesap türü', 'Küçük hesap kipi', 'Hesap değeri', ''],
        satirlar: ADLAR.map((ad, i) => {
          const d = ds[i], b = d && d.bot;
          if (!b) return el('tr', null, [el('td', { text: ad === 'hucum' ? 'Hücum' : 'Denge' }), el('td', { class: 'tone-danger', colspan: '5', text: `durum alınamadı${d && d.error ? ': ' + d.error : ''}` })]);
          const E = D().ozsermaye(d), du = D().durum(b);
          return el('tr', null, [el('td', { class: 'fw-semibold', text: b.adGorunen }), el('td', { text: du.metin }), el('td', { text: D().mod(d, b) }), el('td', { text: KS(b) }),
            el('td', { class: 'sayi', text: E != null ? `${D().para(E)} USDT` : '—' }),
            el('td', null, [el('a', { href: `#/botlar/${ad}/yonetim`, class: 'no-underline', text: 'Yönet →' })])]);
        }).concat(PORTFOY_BOTLARI.map(([id, adG]) => el('tr', null, [el('td', { class: 'fw-semibold', text: adG }), el('td', { text: 'ay sonu kararıyla çalışır' }), el('td', { text: 'kâğıt hesap' }),
          el('td', { text: '—' }), el('td', { class: 'sayi', text: '—' }), el('td', null, [el('a', { href: `#/botlar/${id}`, class: 'no-underline', text: 'Aç →' })])]))) }),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Portföy botları (model portföylerin kâğıt hesapları) yönetilmez: kararları ay sonu kuralından gelir, sermayesi Portföy › Modeller › Bu ay › Ayarlar\'da.' })
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }
  async function ayarYukle() {
    if (!bul('ayarBotlar') && !bul('ayarBotOzet')) return;
    if (!sonDurumlar) { ayarlarCiz(null); ayarOzetCiz(null); }
    sonDurumlar = await Promise.all(ADLAR.map(a => AG.api.bindirmeDurum(a).catch(e => ({ success: false, error: e.message }))));
    ayarlarCiz(sonDurumlar); ayarOzetCiz(sonDurumlar);
    const ilk = sonDurumlar.find(d => d && d.bot);
    telegramSatiri(ilk && ilk.bot.telegram);   // F5: Telegram durumu Ayarlar › Bildirimler'de
  }

  /** Telefon kademesi (60.5): sunucu /api/health → kademe; js/pages/kabuk.js yazar. */
  const telefonMu = () => !!(AG.api && AG.api.kademe && AG.api.kademe() === 'telefon');

  /**
   * TELEFONDAN ACİL DURDURMA (60.5): acil PIN + "DURDUR" yazma diyaloğu → POST /api/bindirme/:ad/acil
   * gövdesinde { pin, onay } (sunucu lib/acilPin.js denetler; 15 dk'da 5 yanlış → kilit + Telegram).
   */
  const telefonPin = () => (AG.pages && AG.pages.kabuk && AG.pages.kabuk.acilPin && AG.pages.kabuk.acilPin()) || {};
  /** Saf: telefonda acil durdurma kullanılamıyorsa nedeni (A-22); kullanılabiliyorsa ''. */
  function telefonAcilNotu(pin) {
    if (!pin || !pin.tanimli) return 'Acil PIN tanımlı değil — telefondan acil durdurma kapalı (sunucuda: npm run acil-pin).';
    if (pin.kilitli) return 'Çok fazla yanlış PIN — telefondan acil durdurma 15 dakika kilitli.';
    return '';
  }

  async function telefonAcil(ad, d, dugme) {
    const b = d.bot;
    const pin = telefonPin();
    if (!pin.tanimli) { bildir('Telefondan acil durdurma kapalı: acil PIN tanımlı değil. Sunucuda "npm run acil-pin" ile belirleyin.', 'hata'); return; }
    if (pin.kilitli) { bildir('Çok fazla yanlış PIN — acil durdurma 15 dakika kilitli.', 'hata'); return; }
    const demo = (d.mod || b.mod) === 'demo';
    const v = await AG.onayla({
      baslik: `${b.adGorunen}: ACİL DURDUR`, onay: 'Acil durdur', iptal: 'Vazgeç', tehlikeli: true,
      metin: `${(d.mod || b.mod) === 'canli' ? 'CANLI hesapta' : demo ? 'DEMO hesapta' : 'Kâğıt hesapta'}: bot durur, bütün emirler iptal edilir, TÜM pozisyonlar piyasa fiyatından kapanır, BTC satılır. Geri alınamaz.\nOnay için acil PIN'inizi girin ve DURDUR yazın.`,
      alanlar: [
        { ad: 'pin', etiket: 'Acil PIN', tip: 'password', inputmode: 'numeric', ipucu: '6–12 hane', dogrula: (s) => /^\d{6,12}$/.test(s) },
        { ad: 'onay', etiket: 'Onay: DURDUR yazın', ipucu: 'DURDUR', dogrula: (s) => s.trim().toLocaleUpperCase('tr-TR') === 'DURDUR' }
      ]
    });
    if (!v) return;
    AG.dom.mesgul(dugme, '…');
    try {
      const r = await AG.api.bindirmeAcil(ad, v.pin, v.onay);
      if (r.acilPin && AG.pages.kabuk && AG.pages.kabuk.kademeyiUygula) AG.pages.kabuk.kademeyiUygula('telefon', r.acilPin);
      if (!r.success) throw new Error(r.error);
      const rp = r.rapor || {};
      bildir(`${b.adGorunen}: ACİL DURDURMA yapıldı — ${rp.iptal || 0} emir iptal, ${rp.kapatilan ? rp.kapatilan.length : 0} pozisyon kapatma emri.`, 'ok');
    } catch (e) {
      bildir(`Acil durdurma yapılamadı: ${e.message}`, 'hata');
    } finally {
      AG.dom.hazir(dugme);
      yukle(true);
    }
  }

  function acilFren(ad, d) {
    const b = d.bot;
    const demo = (d.mod || b.mod) === 'demo';
    const dg = el('button', { type: 'button', class: 'btn btn-danger btn-sm acil-fren', title: AG.sozluk ? AG.sozluk.metin('acilFren') : '' }, [
      el('i', { 'data-lucide': 'octagon-x', class: 'icon-13' }), el('span', { text: telefonMu() ? ' Acil durdur' : ' Acil fren' })]);
    if (telefonMu()) {
      // Denetim A-22: acil PIN tanımlı değilse (ya da kilitliyse) düğme baştan pasif; neden kartta yazılı (telefonAcilNotu).
      const pin = telefonPin();
      if (!pin.tanimli || pin.kilitli) { dg.disabled = true; dg.setAttribute('title', telefonAcilNotu(pin)); return dg; }
      dg.addEventListener('click', () => telefonAcil(ad, d, dg)); return dg;
    }
    dg.addEventListener('click', () => calistir(ad, 'acil', dg, {
      baslik: `${b.adGorunen}: ACİL FREN`, onay: 'Acil freni çek', tehlikeli: true,
      metin: (d.mod || b.mod) === 'canli' ? 'CANLI hesapta: bot durur, bütün emirleri iptal edilir, TÜM pozisyonlar piyasa fiyatından kapanır, vadeli ve spot BTC satılır. Geri alınamaz.'
        : demo ? 'DEMO hesapta: bot durur, bütün emirleri iptal edilir, TÜM pozisyonlar piyasa fiyatından kapanır (BTC vadeli LONG dahil). Geri alınamaz.'
        : 'Kâğıt hesapta: bot durur, kol pozisyonları kapanır, emirler iptal edilir, BTC satılır. Gerçek borsaya dokunulmaz.'
    }));
    return dg;
  }

  function durdurmaBandi(ad, d, du) {
    const b = d.bot;
    let dugme;
    if (du.kaldirilabilir) {
      dugme = el('button', { type: 'button', class: 'btn btn-danger btn-sm' }, [el('span', { text: 'Engeli kaldır' })]);
      dugme.addEventListener('click', () => calistir(ad, 'engel-kaldir', dugme, { baslik: `${b.adGorunen}: engel kaldırılsın mı?`, onay: 'Engeli kaldır', tehlikeli: true,
        metin: `Neden: ${du.ham}. Kaldırınca bot yeniden emir verir. Önce nedeni inceleyin.` }));
    } else {
      dugme = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, [el('span', { text: 'Borsayla karşılaştır' })]);
      dugme.addEventListener('click', () => calistir(ad, 'mutabakat', dugme));
    }
    return el('div', { class: 'bot-dur-bandi', role: 'alert' }, [
      el('div', { class: 'bot-dur-metin' }, [
        el('strong', { text: 'Durduruldu — onay bekliyor' }), yardim('durduruldu'),
        el('div', { text: du.neden, title: du.ham }),
        du.kaldirilabilir ? null : el('div', { class: 'hint hint-sm mb-0', text: 'Pozisyon uyuşmazlığı ancak borsayla karşılaştırma temiz çıkınca kalkar.' })
      ]),
      dugme
    ]);
  }

  const sayiKutu = (etiket, deger, alt, sinif, yardimK, title) => el('div', { class: 'ana-sayi' }, [
    el('span', { class: 'stat-title' }, [el('span', { text: etiket }), yardimK ? yardim(yardimK) : null]),
    el('span', { class: `stat-value stat-value-sm bot-sayi-deger sayi ${sinif || ''}`, text: deger, title: title || null }),
    alt ? el('span', { class: 'hint hint-sm mb-0', text: alt }) : null
  ]);
  const KURAL = {
    hucum: 'BTC trendi yükselişteyken BTC tutar (trend düşüşe dönünce nakde geçer); yanında 15 coinlik sepette trend takibi ve kademeli alım (×3). Her gün 03:00 civarı karar verir.',
    denge: 'Hücum\'un sakin hâli: BTC oranı en çok %50 + aynı coin sepeti (×3). Her gün 03:00 civarı karar verir.'
  };
  const SIMGE = { hucum: 'H', denge: 'D' };
  const sonVeri = {};                 // ad → son /durum yanıtı
  const grafikKip = {};               // ad → 'canli' | 'gecmis'
  const gecmisVeri = {};              // ad → GET /api/tasarimci/gecmis/b-<ad> (null = yükleniyor)
  const SECILI_ANAHTAR = 'ag.botlar.secili';
  let secili = (() => { try { const v = global.localStorage ? global.localStorage.getItem(SECILI_ANAHTAR) : null; return ADLAR.includes(v) ? v : 'hucum'; } catch (e) { return 'hucum'; } })();
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

  /** Saf: hesap eğrisi [{ gun, gercek, golge, btc }] → { getiri, btcGetiri, enDerin, buAy, bas } (başlangıç = ilk gün). */
  function egriOzeti(egri) {
    const l = (egri || []).filter(x => sayiMi(x.gercek) && x.gercek > 0);
    if (l.length < 2) return { getiri: null, btcGetiri: null, enDerin: null, buAy: null, bas: l.length ? l[0].gun : null };
    const ilk = l[0], son = l[l.length - 1];
    let tepe = -Infinity, dd = 0;
    for (const x of l) { tepe = Math.max(tepe, x.gercek); dd = Math.min(dd, x.gercek / tepe - 1); }
    const ay = son.gun.slice(0, 7);
    const onceki = [...l].reverse().find(x => x.gun.slice(0, 7) < ay) || ilk;
    const b0 = l.find(x => sayiMi(x.btc) && x.btc > 0), b1 = [...l].reverse().find(x => sayiMi(x.btc) && x.btc > 0);
    return { getiri: son.gercek / ilk.gercek - 1, btcGetiri: b0 && b1 && b1 !== b0 ? b1.btc / b0.btc - 1 : null, enDerin: dd, buAy: son.gercek / onceki.gercek - 1, bas: ilk.gun };
  }

  /** Saf: para nerede — BTC değeri, coin sepeti (BTC dışı pozisyonların nominali) ve kalan nakit, hesap değerine oranla. */
  function paraDagilimi(d) {
    const E = D().ozsermaye(d);
    if (!(E > 0)) return null;
    const btc = d.btc && !d.btc.hata ? (d.btc.deger || 0) : 0;
    const poz = (d.hesap && !d.hesap.hata && d.hesap.pozisyonlar) || [];
    const sepet = poz.filter(p => !/^BTC\//.test(String(p.symbol))).reduce((a, p) => a + Math.abs(+p.nominal || 0), 0);
    return { E, btc: btc / E, sepet: sepet / E, nakit: Math.max(0, 1 - btc / E - sepet / E) };
  }

  /** Saf: açık pozisyonlar → coin bazında K/Z (giriş → güncel fiyat, yön dahil). */
  function coinKz(d) {
    const poz = (d && d.hesap && !d.hesap.hata && d.hesap.pozisyonlar) || [];
    return poz.filter(p => +p.giris > 0 && +p.mark > 0).map(p => {
      const ham = +p.mark / +p.giris - 1, v = String(p.side).toLowerCase() === 'short' ? -ham : ham;
      return { ad: String(p.symbol).split('/')[0], v, alt: p.gerceklesmemis != null ? `${D().para(p.gerceklesmemis)} USDT` : null };
    });
  }

  function ustCiz(ad, d) {
    const b = d.bot, L = D();
    const du = L.durum(b), rj = L.rejim(b), ka = L.karar(b, bugunStr()), kr = L.koruma(b, L.mod(d, b));
    const modAd = L.mod(d, b);
    const buGece = [ka.metin, rj.acik == null ? null : rj.metin, kr.sorun ? `koruma stopu: ${kr.metin}` : null].filter(Boolean).join(' · ');
    return [
      el('div', { class: `bot-bas bot-r-${ad}` }, [
        el('div', { class: 'bot-simge', 'aria-hidden': 'true', text: SIMGE[ad] || '?' }),
        el('div', { class: 'bot-bas-metin' }, [
          el('div', { class: 'row-inline row-wrap gap-2' }, [
            el('h3', { class: 'card-title m-0', text: b.adGorunen || ad }),
            el('span', { class: `bot-durum-buyuk bot-durum-${du.ton || 'notr'}`, title: du.ham || du.neden || null }, [el('span', { class: 'bot-durum-isik', 'aria-hidden': 'true' }), el('span', { text: du.metin })]),
            el('span', { class: modAd === 'canlı hesap' ? 'badge badge-danger' : 'badge', text: modAd === 'demo' ? 'Binance demo — canlı hesap değil' : modAd === 'canlı hesap' ? 'CANLI HESAP' : 'kâğıt hesap — canlı hesap değil' }),
            yardim(modAd === 'demo' ? 'demo' : modAd === 'canlı hesap' ? 'gercekPara' : 'kagit')
          ]),
          el('p', { class: 'hint mb-0', text: KURAL[ad] || '' }),
          el('p', { class: 'mb-0 bot-bu-gece' }, [el('strong', { text: 'Son karar: ' }), el('span', { text: buGece })])
        ]),
        el('div', { class: 'bot-bas-dugme' }, [telefonMu() ? null : baslatDurdur(ad, d), acilFren(ad, d)])
      ]),
      du.onayBekliyor ? durdurmaBandi(ad, d, du) : null,
      arastirmaMu() ? el('p', { class: 'hint hint-sm bot-eski-kayit mb-0', text: 'Bu bilgisayardaki eski kayıt — asıl durum sunucudaki panelde (bot sunucuda çalışır).' }) : null,
      telefonMu() && telefonAcilNotu(telefonPin()) ? el('p', { class: 'hint hint-sm tone-warning mb-0', text: telefonAcilNotu(telefonPin()) }) : null
    ];
  }

  /** Sayılar: hesap değeri (durum) + eğri özeti (grafik verisi gelince dolar). */
  function sayilarCiz(ad) {
    const k = bul(`botSayilar-${ad}`), d = sonVeri[ad];
    if (!k || !d || !d.bot) return;
    const b = d.bot, L = D();
    const E = L.ozsermaye(d), g = grafikVeri[ad] || {}, oz = egriOzeti((g.oz && g.oz.egri) || []);
    const sp = L.sapma(b), rj = L.rejim(b);
    const t = (x) => ton(!sayiMi(x) || Math.abs(x) < 1e-9 ? '' : x > 0 ? 'iyi' : 'tehlike');
    const bk = d.hesap && !d.hesap.hata && d.hesap.bakiye ? d.hesap.bakiye : null;
    const avbl = bk && bk.serbest != null && sayiMi(+bk.serbest) ? +bk.serbest : null;
    const tb = tabanMetni(g.oz && g.oz.taban);
    doldur(k, [
      sayiKutu('Hesap değeri', E != null ? `${L.para(E)} USDT` : '—', E == null ? 'hesaba bağlı değil' : avbl != null ? `Kullanılabilir (Binance Avbl) ${para2(avbl)}` : 'Binance: Margin Balance', null, 'hesapDegeri',
        E != null ? 'Binance "Margin Balance" (cüzdan + gerçekleşmemiş K/Z). "Avbl" bundan pozisyon ve emir teminatı düşülmüş hâlidir — kırılım aşağıda.' : null),
      sayiKutu('Başlangıçtan', sayiMi(oz.getiri) ? L.isaretli(oz.getiri) : '—', [oz.bas ? `${L.gunAdi(oz.bas)}'den` : 'iki günlük kayıttan sonra', tb].filter(Boolean).join(' · '), t(oz.getiri), null, tb ? TABAN_ACIKLAMA : null),
      sayiKutu('BTC al-tut · aynı dönem', sayiMi(oz.btcGetiri) ? L.isaretli(oz.btcGetiri) : '—', 'kıyas: hiçbir şey yapmasaydı', t(oz.btcGetiri)),
      sayiKutu('Simülasyona göre (30 g)', sp.deger, sp.olculdu ? sp.bant : 'henüz ölçülmedi', ton(sp.ton), 'golge'),
      sayiKutu('En derin düşüş', sayiMi(oz.enDerin) ? L.yuzde(oz.enDerin) : '—', 'zirveden en büyük kayıp', sayiMi(oz.enDerin) && oz.enDerin < 0 ? 'tone-danger' : ''),
      sayiKutu('BTC trendi', rj.acik == null ? '—' : rj.acik ? 'yükselişte' : 'düşüşte', rj.alt, ton(rj.ton), 'btcRejimi', rj.ayrinti)
    ]);
  }

  /** Para nerede + coin bazında K/Z. */
  function dagilimCiz(ad) {
    const k = bul(`botDagilim-${ad}`), kz = bul(`botKz-${ad}`), d = sonVeri[ad];
    if (!k || !d) return;
    const pd = paraDagilimi(d);
    if (!pd) doldur(k, [el('h4', { class: 'pf-bolum-baslik', text: 'Para nerede duruyor?' }), el('p', { class: 'hint hint-sm mb-0', text: 'Bot hesaba bağlı değil — dağılım gösterilemez.' })]);
    else {
      const parca = [['BTC', pd.btc, 'bot-renk-btc'], ['Coin sepeti', pd.sepet, 'bot-renk-sepet'], ['Nakit', pd.nakit, 'bot-renk-nakit']];
      const top = parca.reduce((a, x) => a + x[1], 0) || 1;
      let x0 = 0;
      doldur(k, [el('h4', { class: 'pf-bolum-baslik', text: 'Para nerede duruyor?' }),
        AG.dom.svg('svg', { class: 'bot-dag-svg', viewBox: '0 0 100 6', preserveAspectRatio: 'none', role: 'img', 'aria-label': parca.map(([a, v]) => `${a} ${D().yuzde(v, 0)}`).join(', ') },
          parca.map(([a, v, c]) => { const w = v / top * 100; const r2 = AG.dom.svg('rect', { x: x0, y: 0, width: w, height: 6, class: c }); x0 += w; return r2; })),
        el('ul', { class: 'bot-dag-lejant' }, parca.map(([a, v, c]) => el('li', null, [el('span', { class: `bot-dag-kutu ${c}`, 'aria-hidden': 'true' }), el('span', { text: `${a} ${D().yuzde(v, 0)}` })]))),
        el('p', { class: 'hint hint-sm mt-2 mb-0', text: `Hesap değerine oranla. Coin sepeti vadeli işlemde ×${d.bot.kolCarpani || 3} kaldıraçla tutulur (nominal); BTC oranı hedefi en çok %${Math.round((d.bot.btcPay || 0) * 100)}.` })]);
    }
    if (kz) {
      const kap = el('div', { id: `botKzKap-${ad}` });
      doldur(kz, [el('h4', { class: 'pf-bolum-baslik', text: 'Coin bazında kâr / zarar' }), kap]);
      if (AG.grafik && AG.grafik.cubuk) AG.grafik.cubuk(kap, coinKz(d), { ad: 'Coin kâr/zarar', bosMetin: 'Açık pozisyon yok (ya da bot hesaba bağlı değil).' });
    }
  }

  function aylikCiz(ad) {
    const k = bul(`botAylik-${ad}`);
    if (!k) return;
    const g = grafikVeri[ad] || {}, egri = (g.oz && g.oz.egri) || [];
    const af = AG.pages && AG.pages.portfoyum && AG.pages.portfoyum.aylikGetiri;
    const a = af ? af(egri.map(x => ({ tarih: x.gun, e: x.gercek })), 'e') : { yillar: [] };
    const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const hucre = (v) => el('td', { class: `sayi ${ton(!sayiMi(v) || Math.abs(v) < 1e-9 ? '' : v > 0 ? 'iyi' : 'tehlike')}`, text: sayiMi(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1).replace('.', ',')}` : '' });
    doldur(k, [el('h4', { class: 'pf-bolum-baslik', text: 'Aylık getiri (%)' }), a.yillar.length
      ? AG.tablo.kutulu({ id: `tblBotAylik-${ad}`, sinif: 'table-dense pf-tablo bot-aylik', basliklar: ['Yıl', ...AY, 'Yıl'], satirlar: a.yillar.map(y => el('tr', null, [el('td', { class: 'fw-semibold', text: y.yil }), ...y.aylar.map(hucre), hucre(y.toplam)])) })
      : el('p', { class: 'hint hint-sm mb-0', text: 'Henüz kayıt yok — bot her günlük çalışmada bir hesap değeri kaydı yazar.' })]);
  }

  function kunyeCiz(ad, d) {
    const b = d.bot, L = D();
    const hesap = d.hesap && !d.hesap.hata ? d.hesap : null;
    const modAd = L.mod(d, b);
    const kp = L.kalp(b), kr = L.koruma(b, modAd), mj = L.marj(b, modAd);
    const satir = (etiket, metin, sinif, yardimK, title) => [el('dt', null, [el('span', { text: etiket }), yardimK ? yardim(yardimK) : null]), el('dd', { class: sinif || null, text: metin, title: title || null })];
    const poz = hesap ? (hesap.pozisyonlar.length ? `${hesap.pozisyonlar.length} (${hesap.pozisyonlar.slice(0, 4).map(p => String(p.symbol).split('/')[0]).join(', ')}${hesap.pozisyonlar.length > 4 ? '…' : ''})` : 'yok') : '—';
    const telafi = (b.telafiGecmisi || []).length ? b.telafiGecmisi[b.telafiGecmisi.length - 1] : null;
    const ks = b.kucukSermaye || {}, ksPlan = ks.plan;
    const ksMetin = ksPlan ? `${ksPlan.uygun.length} coin uygun${ksPlan.disarida.length ? ` (dışarıda: ${ksPlan.disarida.map(x => String(x).split('/')[0]).join(', ')})` : ''}` : (b.sermayeTavani < (ks.esik || 5000) ? 'önerilir (sermaye 5000 $ altı)' : 'gerekmez (sermaye ≥ 5000 $)');
    return [el('dl', { class: 'kv-list kv-sik mb-0' }, [
      ...satir('Son çalışma', kp.metin, ton(kp.ton), 'kalp', b.kalp && b.kalp.hata ? `hata: ${b.kalp.hata}` : null),
      ...satir('Coin sepeti', L.kolPay(b), '', 'kolPay'),
      ...satir('Koruma stopu', kr.metin, ton(kr.ton), 'felaketStopu', kr.ayrinti),
      ...satir('Teminat durumu', mj.metin, ton(mj.ton), 'marj', mj.ayrinti),
      ...satir('Açık pozisyon', poz),
      ...satir('Küçük hesap kipi', ksMetin, b.sermayeTavani < (ks.esik || 5000) && ks.secim === false ? 'tone-warning' : '', 'kucukSermaye', ks.not || null),
      b.kesici ? satir('Hesap koruması', b.kesici.taban ? `taban ${Math.round(b.kesici.taban.deger)} USDT · %${Math.round(b.kesici.uyari * 100)} kayıpta uyarı · %${Math.round(b.kesici.acil * 100)} kayıpta durdurur` : 'ilk çalışmada taban alınır', '', 'gercekPara') : [],
      telafi ? satir('Kaçırılan gün', `${telafi.kacirilanGun} (${telafi.kararGun})${telafi.fark != null ? ` · simülasyona göre ${L.isaretli(telafi.fark, 2)}` : ''}`) : [],
      b.asgariNominal && b.asgariNominal.toplam ? satir('Verilmeyen küçük emir', String(b.asgariNominal.toplam), '', null, 'borsanın asgari emir tutarının altında kaldığı için verilmeyen emir sayısı') : [],
      b.demoNot ? satir('Demo / gerçek farkı', 'demoda BTC vadeli işlemde alım (LONG); canlı hesapta spot BTC', '', 'btcAyagi') : [],
      ks.farkliFiltre && ks.farkliFiltre.length ? satir('Kuralı demo ile gerçekte farklı coin', ks.farkliFiltre.map(x => String(x).split('/')[0]).join(', '), 'tone-warning', 'demoGercekFark') : []
    ].flat())];
  }

  // ── Bot sermayesi tabanı (64.5) ──────────────────────────────────────────
  const para2 = (x, b = 2) => (x == null || !Number.isFinite(+x) ? '—' : (+x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b }));
  const TABAN_ACIKLAMA = 'Hesapta botun sermaye tavanından fazla para var. Getiri, en derin düşüş ve grafik botun KENDİ sermayesi üstünden: bot değeri = tavan + (hesap değeri − ilk gün hesap değeri). Hesabın tamamına bölmek kâr/zararı küçültür, tavana kırpmak eğriyi düz çizgi yapardı.';
  /** Saf: grafik verisindeki taban → kutu alt metni (yalnız hesap tavandan büyükse). */
  function tabanMetni(tb) {
    if (!tb || tb.tur !== 'tavan') return null;
    return `bot sermayesi ${D().para(tb.sermaye)} $ (tavan) — hesap ${D().para(tb.hesapSon)} $`;
  }

  // ── Binance bakiyesi (64.5): Binance ekranıyla kuruşu kuruşuna ─────────────
  // Kullanıcı (2026-10-15): "Avbl 4.888,84" ↔ "Hesap değeri 4.949" farkı. GET /api/bindirme/:ad/binance-bakiye, sayfa açıkken 12 sn'de bir.
  const BINANCE_MS = 12000;
  const binanceVeri = {};             // ad → { zaman, r } | { zaman, hata }
  let binanceZamanlayici = null;
  const BAKIYE_SATIR = [
    ['cuzdan', 'Cüzdan bakiyesi', 'Wallet Balance', 'yatırılan para + gerçekleşen kâr/zarar − ücret ± fonlama'],
    ['gerceklesmemis', 'Gerçekleşmemiş K/Z', 'Unrealized PNL', 'açık pozisyonların şu anki kâr/zararı (işaret fiyatıyla)'],
    ['marj', 'Marj bakiyesi = Hesap değeri', 'Margin Balance', 'cüzdan + gerçekleşmemiş K/Z; Pusula\'daki "Hesap değeri" budur'],
    ['pozisyonTeminati', 'Pozisyon teminatı', 'Position Initial Margin', 'açık pozisyonlar için kilitli teminat (nominal ÷ kaldıraç)'],
    ['emirTeminati', 'Açık emir teminatı', 'Open Order Initial Margin', 'bekleyen, pozisyon büyüten emirler için ayrılan teminat'],
    ['toplamTeminat', 'Toplam başlangıç teminatı', 'Total Initial Margin', 'pozisyon teminatı + açık emir teminatı (Binance\'in kendi toplamı)'],
    ['kullanilabilir', 'Kullanılabilir', 'Avbl — Available Balance', 'yeni emir için serbest para; Binance\'in Avbl sayısının KENDİSİ (Pusula hesaplamaz)']
  ];
  const saatStr = (t) => { try { return t ? new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'; } catch (e) { return '—'; } };
  const kzTon = (x) => (sayiMi(x) ? ton(x > 0 ? 'iyi' : x < 0 ? 'tehlike' : '') : '');

  /**
   * Saf: yanıt → denklem + "Binance ile eşleşiyor" satırı. 64.6: Kullanılabilir Binance'in kendi alanıdır (hesaplanmaz); denklem
   * Binance'in totalInitialMargin'iyle kurulur, tolerans max(0,50 $, marjın %0,01'i) — alanlar farklı anlarda hesaplanır (64.5'te
   * 0,01 $ eşiği "EŞLEŞMİYOR fark −0,11" yanlış alarmı verdi).
   */
  function binanceKimlik(r) {
    const b = (r && r.bakiye) || {}, k = r && r.kimlik;
    const asil = `Paneldeki Kullanılabilir, Binance'in Avbl sayısının kendisidir: ${para2(b.kullanilabilir)} USDT.`;
    if (!k) return { asil, denklem: '', metin: 'Binance alanları eksik — denklem denetlenemedi.', ton: 'tone-warning', eslesiyor: null };
    const denklem = `Kullanılabilir = Marj bakiyesi − Toplam başlangıç teminatı: ${para2(b.marj)} − ${para2(b.toplamTeminat)} (pozisyon ${para2(b.pozisyonTeminati)} + emir ${para2(b.emirTeminati)}) = ${para2(k.hesaplanan)} USDT`;
    const farkM = Math.abs(k.fark) < 0.005 ? '0,00' : para2(k.fark);
    return k.eslesiyor
      ? { asil, denklem, metin: `✓ Binance ile eşleşiyor (fark ${farkM} USDT — Binance alanları farklı anlarda hesaplanır)`, ton: 'tone-success', eslesiyor: true }
      : { asil, denklem, metin: `✗ Binance ile EŞLEŞMİYOR — fark ${farkM} USDT (sınır ${para2(k.tolerans)} USDT)`, ton: 'tone-danger', eslesiyor: false };
  }

  function binanceCiz(ad) {
    const k = bul(`botBinance-${ad}`);
    if (!k) return;
    const v = binanceVeri[ad];
    const baslik = el('div', { class: 'row-between row-wrap gap-2 mb-2' }, [
      el('h4', { class: 'pf-bolum-baslik m-0' }, [el('span', { text: 'Binance bakiyesi — Binance\'in kendi sayıları' }), yardim('binanceBakiye')]),
      v && v.r && v.r.zaman ? el('span', { class: 'hint hint-sm mb-0', id: `botBinanceSaat-${ad}`, text: `okundu ${saatStr(v.r.zaman)} · sayfa açıkken 12 sn'de bir` }) : null
    ]);
    if (!v) { doldur(k, [baslik, el('p', { class: 'hint hint-sm mb-0', text: 'Yükleniyor…' })]); return; }
    if (v.hata || !v.r || v.r.success === false) {
      const h = v.hata || (v.r && v.r.error) || 'yanıt yok';
      doldur(k, [baslik, el('p', { class: 'tone-danger mb-0', id: `botBinanceHata-${ad}`, text: /404|Cannot GET|beklenmeyen yanıt/.test(h)
        ? `Binance bakiyesi okunamadı — bu bölüm Pusula 64.5 ile geldi; sunucudaki panel eski sürümdeyse güncelleme kurulunca görünür (${h}).`
        : `Binance bakiyesi okunamadı: ${h}` })]);
      return;
    }
    const r = v.r, parca = [baslik];
    if (r.evKaynak) {
      parca.push(el('p', { class: `hint hint-sm mb-2 ${r.evKaynak.eski ? 'tone-warning' : ''}`, id: `botBinanceEv-${ad}`,
        text: r.evKaynak.eski ? `Sunucudaki panele şu an ulaşılamadı — ${saatStr(r.evKaynak.zaman)} tarihli son okuma gösteriliyor${r.evKaynak.hata ? ` (${r.evKaynak.hata})` : ''}.` : `Sunucudaki panelden okundu (${saatStr(r.evKaynak.zaman)}).` }));
    }
    if (!r.bagli || r.binance === false) {
      parca.push(el('div', { class: 'bot-binance-bant tone-warning', role: 'status', id: `botBinanceBant-${ad}` }, [
        el('p', { class: 'mb-0', text: r.neden || 'Binance bakiyesi okunmuyor.' }),
        r.sonKayit ? el('p', { class: 'hint hint-sm mb-0', text: `Bu bilgisayardaki son kayıt (eski kopya): ${r.sonKayit.gun} — hesap değeri ${para2(r.sonKayit.ozsermaye)} USDT. Kırılım (Avbl, teminatlar) yalnız bot borsaya bağlıyken okunur.` }) : null
      ]));
      doldur(k, parca);
      return;
    }
    const b = r.bakiye || {}, kim = binanceKimlik(r);
    parca.push(AG.tablo.kutulu({ id: `tblBinanceBakiye-${ad}`, sinif: 'table-dense pf-tablo bot-binance-bakiye', basliklar: ['Kalem', 'Binance\'teki adı', 'USDT', 'Ne demek?'],
      satirlar: BAKIYE_SATIR.map(([a, adi, bin, ack]) => el('tr', { class: a === 'marj' || a === 'kullanilabilir' ? 'fw-semibold' : null }, [
        el('td', { text: adi }), el('td', { class: 'hint-sm', text: bin }),
        el('td', { class: `sayi ${a === 'gerceklesmemis' ? kzTon(b[a]) : ''}`, text: para2(b[a]) }),
        el('td', { class: 'hint-sm', text: ack })])) }));
    parca.push(el('p', { class: 'mb-1 mt-2 fw-semibold', id: `botBinanceAsil-${ad}`, text: kim.asil }));
    parca.push(el('p', { class: 'mb-1 sayi', id: `botBinanceDenklem-${ad}`, text: kim.denklem }));
    parca.push(el('p', { class: `mb-2 fw-semibold ${kim.ton}`, id: `botBinanceEsles-${ad}`, text: kim.metin }));
    if (r.marjKimlik && !r.marjKimlik.eslesiyor) {
      parca.push(el('p', { class: 'mb-2 tone-danger', text: `Marj bakiyesi ≠ cüzdan + gerçekleşmemiş K/Z (fark ${para2(r.marjKimlik.fark)} USDT) — çoklu varlık kipi ya da Binance alan değişikliği olabilir.` }));
    }

    parca.push(el('p', { class: 'hint hint-sm mb-0 mt-1', text: 'Açık pozisyonlar ve bekleyen emirler (Binance\'teki sütunlarla) grafiğin altındaki İşlemler panelinde.' }));
    doldur(k, parca);
  }

  async function binanceYukle(ad) {
    if (!AG.api || !AG.api.bindirmeBinanceBakiye) return;
    try {
      const r = await AG.api.bindirmeBinanceBakiye(ad);
      binanceVeri[ad] = { zaman: Date.now(), r };
    } catch (e) { binanceVeri[ad] = { zaman: Date.now(), hata: e.message }; }
    binanceCiz(ad);
  }
  /** Botlar sayfası görünür ve seçili botun kartı açıkken 12 sn'de bir (yalnız seçili bot). */
  function binanceZamanla() {
    if (binanceZamanlayici || typeof global.setInterval !== 'function') return;
    binanceZamanlayici = global.setInterval(() => {
      const kart = bul(`botKart-${secili}`);
      if (!kart || kart.classList.contains('is-hidden') || kart.offsetParent === null) return;
      if (doc && doc.visibilityState === 'hidden') return;
      binanceYukle(secili);
    }, BINANCE_MS);
    if (binanceZamanlayici && typeof binanceZamanlayici.unref === 'function') binanceZamanlayici.unref();   // Node testleri beklemesin
  }

  // ── Grafik: Canlı (hesap ↔ simülasyon ↔ BTC) ↔ Geçmiş (backtest) ─────────
  async function grafikYukle(ad, zorla) {
    const g = grafikVeri[ad];
    if (!zorla && g && Date.now() - g.zaman < GRAFIK_MS) { grafikCiz(ad); return; }
    grafikVeri[ad] = { zaman: Date.now(), oz: g ? g.oz : null };
    try {
      const r = await AG.api.bindirmeGrafik(ad);
      if (!r.success) throw new Error(r.error);
      grafikVeri[ad] = { zaman: Date.now(), oz: r.ozsermaye || { egri: [] } };
    } catch (e) { grafikVeri[ad] = { zaman: Date.now(), oz: null, hata: e.message }; }
    grafikCiz(ad); sayilarCiz(ad); aylikCiz(ad);
  }
  const kipAl = (ad) => grafikKip[ad] || ((((grafikVeri[ad] || {}).oz || {}).egri || []).length < 20 ? 'gecmis' : 'canli');

  /** `zorla`: tema değişince renkler için yeniden kur; yoksa aynı veriyle çizili grafik KORUNUR (tazelemede titremez). */
  function grafikCiz(ad, zorla) {
    const not = bul(`botGrafikNot-${ad}`), tuval = bul(`botGrafik-${ad}`), kutuK = bul(`botGrafikKutu-${ad}`), gecmisK = bul(`botGecmis-${ad}`), kipK = bul(`botGrafikKip-${ad}`);
    const g = grafikVeri[ad] || {};
    const egri = (g.oz && g.oz.egri) || [];
    const kip = kipAl(ad);
    if (kipK) doldur(kipK, [['canli', `Canlı (${egri.length} gün)`], ['gecmis', 'Geçmiş — backtest (2020\'den)']].map(([a, t]) =>
      el('button', { type: 'button', class: `btn btn-xs bot-serbest ${kip === a ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': kip === a ? 'true' : 'false', id: `btnBotKip-${a}-${ad}`,
        onclick: () => { grafikKip[ad] = a; grafikCiz(ad, true); } }, [el('span', { text: t })])));
    if (kutuK) kutuK.classList.toggle('is-hidden', kip !== 'canli' || egri.length < 2);
    if (gecmisK) gecmisK.classList.toggle('is-hidden', kip !== 'gecmis');
    if (kip === 'gecmis') {
      const gv = gecmisVeri[ad];
      if (gv === undefined) gecmisYukle(ad);
      if (not) not.textContent = !gv ? 'Geçmiş yükleniyor…' : `${gv.uyari || ''} Aylık, başlangıç 100 (USD).`;
      if (gv && gecmisK && AG.grafik && AG.grafik.ana) {
        const [ana, ...diger] = (gv.seriler || []).filter(x => x.noktalar && x.noktalar.length);
        if (ana) AG.grafik.ana(gecmisK, { ad: `${ad} geçmiş`, etiket: ana.ad, birim: '', dusus: true, seri: ana.noktalar.map(([t, v]) => ({ t, v })),
          kiyas: diger.map(x => ({ ad: x.ad, seri: x.noktalar.map(([t, v]) => ({ t, v })) })),
          krizler: [{ ad: 'Covid', bas: '2020-02-19', bit: '2020-04-30' }, { ad: '2022 düşüşü', bas: '2022-01-01', bit: '2022-12-31' }].filter(z => gv.baslangic && z.bit > gv.baslangic) });
      }
      return;
    }
    if (not) not.textContent = g.hata ? `Grafik verisi alınamadı: ${g.hata}` : !g.oz ? 'Yükleniyor…'
      : egri.length < 2 ? 'Henüz grafik yok — bot her günlük çalışmada bir hesap değeri kaydı yazar; iki gün sonra eğri görünür. O zamana kadar "Geçmiş" grafiğine bakın.'
        : `Başlangıç = 1 · ${egri[0].gun} → ${egri[egri.length - 1].gun}${tabanMetni(g.oz.taban) ? ` · ${tabanMetni(g.oz.taban)}: eğri botun kendi sermayesi üstünden (hesaptaki fazla para eğriye katılmaz)` : ''}${g.oz.golgeEksik ? ` · simülasyon kaydı eksik gün: ${g.oz.golgeEksik}` : ''}`;
    if (!tuval || egri.length < 2 || typeof global.Chart === 'undefined') return;
    if (grafikler[ad] && grafikler[ad].agVeri === g.oz && !zorla) return;
    if (grafikler[ad]) { grafikler[ad].destroy(); grafikler[ad] = null; }
    const p = AG.tema.palet();
    const seri = (label, data, renk, ek = {}) => ({ label, data, borderColor: renk, backgroundColor: renk, borderWidth: 1.2, pointRadius: egri.length < 30 ? 2 : 0, tension: 0.05, ...ek });
    grafikler[ad] = new global.Chart(tuval.getContext('2d'), {
      type: 'line',
      data: { labels: egri.map(x => x.gun), datasets: [
        seri(tabanMetni(g.oz.taban) ? `Bot değeri (${D().para(g.oz.taban.sermaye)} $ tavan)` : 'Hesap değeri', egri.map(x => x.gercek), p.seri1, { borderWidth: 2.4 }),
        seri('Simülasyon (aynı kurallar)', egri.map(x => x.golge), p.seri2, { borderDash: [5, 3] }),
        seri('BTC al-tut', egri.map(x => x.btc), p.notr, { borderWidth: 1 })
      ] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { color: p.text, boxWidth: 10, font: { size: 11 } } } },
        scales: { x: { grid: { color: p.grid }, ticks: { color: p.text, maxTicksLimit: 6 } }, y: { grid: { color: p.grid }, ticks: { color: p.text, maxTicksLimit: 5 } } } }
    });
    grafikler[ad].agVeri = g.oz;
  }
  async function gecmisYukle(ad) {
    if (gecmisVeri[ad] === null) return;
    gecmisVeri[ad] = null;
    try { const r = await AG.api.tasarimci.gecmis(`b-${ad}`); gecmisVeri[ad] = r && r.success ? r : { seriler: [], uyari: `Geçmiş okunamadı: ${(r && r.error) || 'yanıt yok'}.` }; }
    catch (e) { gecmisVeri[ad] = { seriler: [], uyari: `Geçmiş okunamadı: ${e.message}.` }; }
    grafikCiz(ad, true);
  }

  // ── Kart ─────────────────────────────────────────────────────────────────
  /** Kartın kalıcı iskeleti (bir kez): üst · sayılar · grafik · dağılım + K/Z · aylık · künye. */
  function iskelet(ad) {
    let kart = bul(`botKart-${ad}`);
    if (kart) return kart;
    kart = el('article', { id: `botKart-${ad}`, class: `glass-panel panel-pad bot-kart bot-r-${ad}${ad === secili ? '' : ' is-hidden'}`, 'aria-label': ad === 'hucum' ? 'Hücum' : 'Denge' }, [
      el('div', { id: `botKartUst-${ad}`, class: 'bot-kart-bolum' }, [el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]),
      el('div', { id: `botSayilar-${ad}`, class: 'ana-sayilar bot-sayilar' }),
      el('div', { id: `botBinance-${ad}`, class: 'bot-blok' }),
      el('div', { class: 'bot-blok' }, [
        el('div', { class: 'row-between row-wrap gap-2 mb-2' }, [el('h4', { class: 'pf-bolum-baslik m-0', text: 'Hesap değeri · BTC al-tut · simülasyon' }), el('div', { id: `botGrafikKip-${ad}`, class: 'pf-dugmeler' })]),
        el('div', { id: `botGrafikKutu-${ad}`, class: 'canvas-box bot-grafik-tuval is-hidden' }, [
          el('canvas', { id: `botGrafik-${ad}`, role: 'img', 'aria-label': 'Hesap değeri, simülasyon ve BTC eğrileri — başlangıç 1' })
        ]),
        el('div', { id: `botGecmis-${ad}`, class: 'is-hidden' }),
        el('p', { id: `botGrafikNot-${ad}`, class: 'hint hint-sm mb-0 mt-2', text: 'Yükleniyor…' })
      ]),
      el('div', { class: 'mp-iki' }, [el('div', { id: `botDagilim-${ad}`, class: 'bot-blok' }), el('div', { id: `botKz-${ad}`, class: 'bot-blok' })]),
      el('div', { id: `botAylik-${ad}`, class: 'bot-blok' }),
      el('details', { class: 'hs-kat-mini bot-kunye-kat', id: `botKunyeKat-${ad}` }, [el('summary', { text: 'Botun künyesi — son çalışma, koruma stopu, teminat, hesap koruması, küçük hesap kipi' }), el('div', { id: `botKartAlt-${ad}`, class: 'mt-2' })])
    ]);
    const kap = bul('botKartlari');
    if (kap) kap.appendChild(kart);
    return kart;
  }

  function kartCiz(ad, d) {
    const kart = iskelet(ad);
    const ust = bul(`botKartUst-${ad}`), alt = bul(`botKartAlt-${ad}`);
    if (!d || !d.success || !d.bot) {
      doldur(ust, [el('h3', { class: 'card-title', text: ad === 'hucum' ? 'Hücum' : 'Denge' }), el('p', { class: 'tone-danger mb-0', text: `Durum alınamadı${d && d.error ? ': ' + d.error : ''}` })]);
      doldur(alt, []);
      return kart;
    }
    sonVeri[ad] = d;
    kart.classList.toggle('bot-kart-dur', !!d.bot.engel);
    doldur(ust, ustCiz(ad, d));
    doldur(alt, kunyeCiz(ad, d));
    sayilarCiz(ad); dagilimCiz(ad);
    return kart;
  }

  /** Bot sekmeleri: renkli nokta · ad · kısa durum. */
  function sekmelerCiz() {
    const k = bul('botSekmeler');
    if (!k) return;
    doldur(k, ADLAR.map(ad => {
      const d = sonVeri[ad], b = d && d.bot, du = b ? D().durum(b) : null;
      return el('button', { type: 'button', role: 'tab', id: `botSekme-${ad}`, class: `pf-alt-sekme bot-sekme bot-r-${ad}${ad === secili ? ' is-active' : ''}`, 'aria-selected': ad === secili ? 'true' : 'false', onclick: () => sec(ad) }, [
        el('span', { class: 'pf-sekme-nokta bot-sekme-nokta', 'aria-hidden': 'true' }), el('span', { text: (b && b.adGorunen) || (ad === 'hucum' ? 'Hücum' : 'Denge') }),
        du ? el('span', { class: `pf-is-sayi bot-sekme-durum bot-durum-${du.ton || 'notr'}`, text: du.onayBekliyor ? 'onay bekliyor' : du.metin.toLocaleLowerCase('tr-TR') }) : null
      ]);
    }));
  }
  /**
   * 68.8 PORTFÖY BOTLARI: model portföylerin kâğıt hesapları Botlar'da kendi sayfalarında (#/botlar/<model id>, yan menü
   * Botlar › Portföy botları). Sayfa açıkken bölüme .pbot-acik konur — Hücum/Denge kapları CSS ile gizlenir (kendi
   * is-hidden durumları bozulmaz; geri dönünce aynı görünüm açılır).
   */
  const portfoyBotuMu = (alt) => !!(AG.pages && AG.pages.portfoyBotlari && AG.pages.portfoyBotlari.SIRA.includes(alt));
  function portfoyGorunumu(acik) {
    const b = bul('tab-botlar');
    if (b) b.classList.toggle('pbot-acik', !!acik);
    if (!acik && AG.pages && AG.pages.portfoyBotlari && AG.pages.portfoyBotlari.acik()) AG.pages.portfoyBotlari.kapat();
  }
  /** Yeni panel F2/F5: seçili bot + görünüm adreste (#/botlar/hucum/hesap) — yan menüde Botlar › Hücum işaretlenir, yenileme aynısını açar. */
  const GORUNUMLER = ['genel', 'hesap', 'islemler', 'yonetim'];
  let gorunum = 'genel';
  function adresYaz(ad) {
    try {
      const h = global.location ? global.location.hash : '';
      if (!/^#\/botlar(\/|$)/.test(h || '') || !global.history || !global.history.replaceState) return;
      const yeni = `#/botlar/${ad}/${gorunum}`;
      if (h !== yeni) global.history.replaceState(null, '', yeni);
      if (AG.rota && AG.rota.altDegisti) AG.rota.altDegisti(`${ad}/${gorunum}`);
    } catch (e) { /* file:// vb.: adres yazılamadı, bot yine seçilir */ }
  }
  /** Botun borsadaki hesabı (Hesap görünümü): hesaplar.js bağlantılarından botu kullanan; yoksa demo (Hücum) / kâğıt hesabı. */
  function botHesabi(ad) {
    const H = AG.pages.hesaplar, v = H && H.son && H.son();
    const adG = ad === 'hucum' ? 'Hücum' : 'Denge';
    const l = (v && v.baglantilar) || [];
    const b = l.find(x => (x.kaynakAdlari || []).some(k => String(k).includes(adG)));
    return b ? b.hesap : ad === 'hucum' ? 'testnet' : `kagit-${ad}`;
  }
  /** Görünümü uygular: kaplar, sekme işaretleri, Binance bakiyesi kartı Hesap'ta, görünüme özgü yüklemeler. */
  async function gorunumUygula() {
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll('[data-bot-gorunum-kap]').forEach(k => k.classList.toggle('is-hidden', k.getAttribute('data-bot-gorunum-kap') !== gorunum));
    doc.querySelectorAll('[data-bot-gorunum]').forEach(d => d.setAttribute('aria-selected', d.getAttribute('data-bot-gorunum') === gorunum ? 'true' : 'false'));
    const hb = bul('botHesapBinance');
    for (const x of ADLAR) { const b = bul(`botBinance-${x}`); if (b && hb && b.parentNode !== hb) hb.appendChild(b); if (b) b.classList.toggle('is-hidden', x !== secili); }
    if (gorunum === 'hesap' && AG.pages.hesaplar) {
      await AG.pages.hesaplar.yukle(false);
      AG.pages.hesaplar.sec(botHesabi(secili));
    }
    if (gorunum === 'yonetim') {
      ayarYukle();
      // Demo kabul süreci (İleri test kartı) yalnız Hücum'da — kart DOM'u buraya taşınır, ileri.js aynı kimlikle doldurur.
      const kap = bul('botKabulSureci'), kart = bul('ileriDemoKabulKap');
      if (kap && kart) { if (kart.parentNode !== kap) kap.appendChild(kart); kart.classList.toggle('is-hidden', secili !== 'hucum'); }
      if (secili === 'hucum' && AG.pages.ileri) AG.pages.ileri.yukle(false);
    }
    // Gizli kapta kurulan grafikler (TradingView, Chart.js) görünür olunca boyutunu yeniden ölçsün.
    try { global.dispatchEvent(new global.Event('resize')); } catch (e) { /* eski tarayıcı */ }
  }
  function gorunumSec(g) {
    if (!GORUNUMLER.includes(g)) g = 'genel';
    gorunum = g;
    adresYaz(secili);
    gorunumUygula();
  }
  function sec(ad) {
    if (!ADLAR.includes(ad)) return;
    portfoyGorunumu(false);
    secili = ad;
    adresYaz(ad);
    try { if (global.localStorage) global.localStorage.setItem(SECILI_ANAHTAR, ad); } catch (e) { /* özel pencere */ }
    for (const x of ADLAR) { const c = bul(`botKart-${x}`); if (c) c.classList.toggle('is-hidden', x !== ad); }
    sekmelerCiz();
    if (gorunum !== 'genel') gorunumUygula();
    const bas = bul('txtBotCoinBaslik'); if (bas) bas.textContent = `Coin grafiği — ${ad === 'hucum' ? 'Hücum' : 'Denge'}`;
    if (AG.pages.bindirmeIslem && AG.pages.bindirmeIslem.botSec) AG.pages.bindirmeIslem.botSec(ad);
    grafikCiz(ad, true);
    if (!binanceVeri[ad] || Date.now() - binanceVeri[ad].zaman >= BINANCE_MS) binanceYukle(ad); else binanceCiz(ad);
  }

  /**
   * Telegram durumu: bağlı değilse yerini gösterir. Denetim A-12: araştırma kopyasında Telegram BİLİNÇLİ kapalıdır
   * (aynı bot jetonunu iki sunucu dinlemesin) — kurulum talimatı yerine bunu söyler.
   */
  function telegramSatiri(tg) {
    const yer = bul('txtPortfoyTelegram');
    if (!yer) return;
    const bagli = !!(tg && tg.bagli);
    if (!bagli && arastirmaMu()) {
      yer.className = 'hint hint-sm mb-0';
      yer.textContent = 'Bu bilgisayarda Telegram bilinçli olarak kapalı (araştırma kopyası) — bildirimleri sunucu gönderir.';
      return;
    }
    yer.className = `hint hint-sm mb-0 ${bagli ? 'tone-success' : 'tone-warning'}`;
    yer.textContent = bagli ? 'Telegram bağlı — günlük özet, işlem ve alarm bildirimleri gidiyor.'
      : `${(tg && tg.neden) || 'Telegram bağlı değil'}. Yeri: Ayarlar → Telegram bildirimleri (BotFather token + chat id, Etkinleştir, Kaydet, Test).`;
  }

  async function yukle(zorla) {
    if (!bul('botKartlari')) return;
    if (!zorla && Date.now() - durumZamani < 15000) return;
    durumZamani = Date.now();
    const ds = await Promise.all(ADLAR.map(a => AG.api.bindirmeDurum(a).catch(e => ({ success: false, error: e.message }))));
    ds.forEach((d, i) => kartCiz(ADLAR[i], d));
    sonDurumlar = ds;
    sekmelerCiz();
    const bas = bul('txtBotCoinBaslik'); if (bas) bas.textContent = `Coin grafiği — ${secili === 'hucum' ? 'Hücum' : 'Denge'}`;
    const ilk = ds.find(d => d && d.bot);
    telegramSatiri(ilk && ilk.bot.telegram);
    ADLAR.forEach(ad => grafikYukle(ad, false));
    if (zorla || !binanceVeri[secili] || Date.now() - binanceVeri[secili].zaman >= BINANCE_MS) binanceYukle(secili);
    binanceZamanla();
    if (bul('ayarBotlar')) ayarlarCiz(ds);
    if (gorunum !== 'genel') gorunumUygula();   // F5: kart (Binance bakiyesi bloğu) yeni kurulduysa Hesap görünümüne taşınsın
    // 62.3: hisse yapılarının kâğıt hesapları Portföy › Model portföyler'e taşındı (js/pages/hisseYapilari.js)
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:tema', () => ADLAR.forEach(ad => { if (grafikVeri[ad]) grafikCiz(ad, true); }));
    // 62.6: Ayarlar açılınca bot yönetimi tablosu
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-settings') ayarYukle(); });
    // Yeni panel F2/F5: #/botlar/<bot>/<görünüm> seçili botu ve görünümü açar; eksik parça son seçilenle tamamlanıp adrese yazılır.
    doc.addEventListener('ag:rota', (e) => {
      if (!e.detail || e.detail.bolum !== 'tab-botlar') return;
      const [alt, g] = String(e.detail.alt || '').split('/');
      // 68.8: #/botlar/m-qqq-m10 · m-bist-m10 · m-837 → portföy botu sayfası (js/pages/portfoyBotlari.js); Hücum/Denge görünümleri gizli.
      if (portfoyBotuMu(alt)) { portfoyGorunumu(true); AG.pages.portfoyBotlari.ac(alt); return; }
      portfoyGorunumu(false);
      if (GORUNUMLER.includes(g)) gorunum = g;
      if (ADLAR.includes(alt) && alt !== secili) sec(alt); else adresYaz(secili);
      gorunumUygula();
    });
    // Görünüm sekmeleri (işaretlemede, #botGorunumler)
    const baglaGorunum = () => doc.querySelectorAll && doc.querySelectorAll('[data-bot-gorunum]').forEach(d => {
      if (d.dataset && d.dataset.bagli) return;
      if (d.dataset) d.dataset.bagli = '1';
      d.addEventListener('click', () => gorunumSec(d.getAttribute('data-bot-gorunum')));
    });
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baglaGorunum); else baglaGorunum();
  }

  AG.pages = AG.pages || {};
  AG.pages.botlar = { portfoyGorunumu, portfoyBotuMu, yukle, kartCiz, grafikCiz, telegramSatiri, telefonAcil, telefonAcilNotu, ADLAR, sec, secili: () => secili, ayarYukle, ayarlarCiz, ayarOzetCiz, gorunumSec, gorunum: () => gorunum, GORUNUMLER, botHesabi, egriOzeti, paraDagilimi, coinKz, binanceKimlik, tabanMetni, binanceCiz, grafikYukle, _binanceVeri: binanceVeri };
})(typeof window !== 'undefined' ? window : globalThis);
