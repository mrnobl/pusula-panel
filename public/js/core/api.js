/**
 * API KATMANI — 28 ucun tamamı tek yerde (`PLAN-MOTOR.md` §8, P2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Panelde 56 ayrı `fetch` çağrısı vardı ve her biri kendi başlığını, gövde
 * serileştirmesini ve hata işlemesini elle yazıyordu. Ölçülen sonuçları:
 *
 *   · `/api/config`e POST ATAN ON BİR AYRI YER — aynı üç satır on bir kez.
 *   · `/api/backtest`e dört ayrı çağrı, üçü farklı gövde kuruyor.
 *   · Hiçbiri `res.ok` bakmıyor. Sunucu 500 ile HTML dönerse `res.json()`
 *     "Unexpected token <" diye patlıyor; ekranda görünen hata sunucunun
 *     söylediği şey değil, ayrıştırıcının şikâyeti oluyordu.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SÖZLEŞME
 * ───────────────────────────────────────────────────────────────────────────
 * Her fonksiyon ÇÖZÜMLENMİŞ JSON döndürür — bugünkü `await res.json()` ile
 * birebir aynı. HTTP durumu 2xx olmasa da gövde JSON ise AYNEN döndürülür:
 * sunucu hataları `{ success:false, error }` biçiminde geliyor ve çağıranlar
 * tam olarak buna bakıyor; durum koduna göre hata fırlatmak o dalları
 * sessizce baypas ederdi.
 *
 * Hata YALNIZCA gövde JSON değilse fırlatılır ve mesaj durum kodunu + gövde
 * başlangıcını taşır. Bu, bugünkü davranışın kaybı değil kazancıdır: aynı
 * durumda bugün de bir istisna atılıyor, sadece anlaşılmaz olanı.
 *
 * ⚠ Bu dosya DOM'a dokunmaz ve durum tutmaz. Tarayıcı dışında (Node) da
 * yüklenebilir olması gerekiyor — `scripts/panel-core-testi.js` her ucun
 * ürettiği isteği sahte bir `fetch` ile doğruluyor.
 */
(function (global) {
  'use strict';

  const JSON_BASLIK = { 'Content-Type': 'application/json' };

  /**
   * HTTP DURUM KODU — Symbol anahtarıyla, sayılamaz (non-enumerable).
   *
   * On bir çağrı yeri `!res.ok || !data.success` diye bakıp hata mesajına
   * `HTTP ${res.status}` yazıyordu. `res` artık çağırana ulaşmıyor, ama
   * durum kodu hâlâ gerekli — sunucu `error` alanı olmadan hata dönerse
   * gösterilecek tek bilgi o.
   *
   * Neden Symbol ve neden sayılamaz: yanıt gövdesine sıradan bir alan
   * eklemek onu SUNUCUDAN GELMİŞ gibi gösterirdi. `JSON.stringify`,
   * `Object.keys` ve yayma (spread) bu anahtarı görmez; yalnızca açıkça
   * `veri[AG.api.DURUM]` diye soran görür.
   */
  const DURUM = Symbol('httpDurum');

  /**
   * KADEME (60.5): sunucu `/api/health` → `kademe` ('yerel' | 'telefon') söyler; js/pages/kabuk.js
   * `kademeAyarla` ile yazar. Telefonda yazma yalnız acil durdurma uçlarına (lib/acilPin.js ACIL_YOLU ile aynı).
   */
  /**
   * Panel denetimi A-08: `/api/health` cevabı gelmeden sayfa modülleri yazma isteği atabiliyordu (telefonda Ana sayfa
   * açılışında POST /api/tarama/otomatik → 403 + konsol hatası). Sunucu loopback DIŞI Host'u her zaman telefon kademesi
   * sayar (lib/guvenlik.js kademe) — tarayıcı adresi loopback değilse başlangıç kademesi baştan 'telefon'.
   */
  const ilkKademe = () => {
    try {
      const h = global.location && global.location.hostname;
      if (!h) return 'yerel';
      return /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(h) ? 'yerel' : 'telefon';
    } catch (e) { return 'yerel'; }
  };
  let kademe = ilkKademe();
  // lib/acilPin.js TELEFON_PIN_YOLU ile aynı: acil durdurma + (61.3) güncelleme kontrol/kur + (73.8) sorun araçları — hepsi PIN'li.
  const TELEFON_YAZMA = /(?:^\/api\/(bindirme\/[^/]+\/acil|kalkan\/acil|exchange\/kill)$)|(?:^\/api\/guncelleme\/(kontrol|uygula)$)|(?:^\/api\/sorun-arac\/(kayit-esitle|zarar-siniri-sifirla|sapma-kabul|yatirma-kabul)\/uygula$)/;
  const TELEFON_MESAJI = 'Telefondan yalnız izleme, acil durdurma ve güncelleme yapılır (Sorunlar sayfasının PIN\'li araçları da) — bu işlem sunucudaki panelden yapılır.';

  /**
   * 69.6 YEREL PIN (lib/yerelPin.js): masaüstü panelin tehlikeli işlemleri sunucudan 403 + `kod: 'pin-gerekli'` alır.
   * Bu dosya DOM'a dokunmaz — PIN'i soran pencere js/core/bildirim.js'te (`pinIsteyiciAyarla` ile bağlanır). Pencere doğru
   * PIN'le 10 dakikalık oturum açınca istek BİR KEZ yinelenir.
   */
  let pinIsteyici = null;

  /**
   * 72.0 BOT ADLARI: yanıttaki { ad: 'hucum', adGorunen: 'Hücum' } gibi bot nesnelerinde görünen ad KİMLİKTEN
   * yeniden yazılır (js/core/sozluk.js AG.botAd) — sunucu eski sürümdeyse eski adı gönderir; ekranda yine yeni ad görünür.
   * Kimlik tanınmazsa ad metnindeki eski adlar çevrilir. AG.botAd yoksa (Node testi) dokunulmaz.
   */
  function botAdCanlandir(anahtar, deger) {
    const B = global.AG && global.AG.botAd;
    if (!B || !deger || typeof deger !== 'object' || Array.isArray(deger) || typeof deger.adGorunen !== 'string') return deger;
    deger.adGorunen = B.ad(deger.ad) || B.cevir(deger.adGorunen);
    return deger;
  }
  const pinGerekliMi = (status, veri) => status === 403 && veri && typeof veri === 'object' && veri.kod === 'pin-gerekli';

  /**
   * Tek giriş noktası. Gövde verilmişse POST varsayılır ve JSON'a çevrilir.
   *
   * `secenek.yontem` açıkça verilebilir; gövdesiz POST'lar (kill-switch
   * sıfırlama gibi) böyle yazılır.
   */
  async function istek(yol, secenek) {
    const s = secenek || {};
    const govdeVar = s.govde !== undefined && s.govde !== null;
    const yontem = s.yontem || (govdeVar ? 'POST' : 'GET');

    // TELEFON KADEMESİ (60.5): yazma isteği sunucuya gitmeden aynı sözleşmeyle reddedilir (sunucu da 403 verir;
    // bu yalnız anlaşılır mesaj ve boşa istek atmamak için). Tek istisna acil durdurma uçları.
    if (kademe === 'telefon' && yontem !== 'GET' && yontem !== 'HEAD' && !TELEFON_YAZMA.test(String(yol).split('?')[0])) {
      const red = { success: false, kademe: 'telefon', error: TELEFON_MESAJI };
      Object.defineProperty(red, DURUM, { value: 403, enumerable: false });
      return red;
    }

    const init = { method: yontem };
    if (govdeVar) {
      init.headers = JSON_BASLIK;
      init.body = JSON.stringify(s.govde);
    }

    const res = await global.fetch(yol, init);
    const metin = await res.text();

    let veri;
    if (metin === '') veri = {};
    else {
      try {
        veri = JSON.parse(metin, botAdCanlandir);
      } catch (e) {
        /**
         * Gövde HTML ise sebep neredeyse her zaman AYNI: uç yok, çünkü
         * sunucu eski bir sürümü çalıştırıyor. Panelde üç ayrı yerde elle
         * `content-type` kontrolü yazılmasının sebebi buydu; kontrol artık
         * burada, tek yerde.
         */
        const htmlMi = /^\s*</.test(metin);
        throw new Error(htmlMi
          ? `${yontem} ${yol} → HTTP ${res.status}: uç bulunamadı (sunucu eski sürümü mü çalıştırıyor?)`
          : `${yontem} ${yol} → HTTP ${res.status}, JSON değil: ${metin.slice(0, 120)}`);
      }
    }

    if (pinGerekliMi(res.status, veri) && pinIsteyici && !s.pinYineleme) {
      let ok = false;
      try { ok = await pinIsteyici(veri); } catch (e) { ok = false; }
      if (ok) return istek(yol, Object.assign({}, s, { pinYineleme: true }));
    }
    if (veri && typeof veri === 'object') {
      Object.defineProperty(veri, DURUM, { value: res.status, enumerable: false });
    }
    return veri;
  }

  const al = (yol) => istek(yol);
  /** Düz metin (Markdown) okuma: JSON beklenmez; 2xx değilse hata. */
  async function metinAl(yol) {
    const res = await global.fetch(yol, { method: 'GET' });
    if (!res.ok) throw new Error(`GET ${yol} → HTTP ${res.status}`);
    return res.text();
  }
  const gonder = (yol, govde) => istek(yol, { govde });
  const tetikle = (yol) => istek(yol, { yontem: 'POST' });
  const q = encodeURIComponent;
  const hesaplarSorgu = ({ durum = '', hesap = '', kaynak = '', sembol = '', bas = '', bit = '', sayfa = 1 } = {}) =>
    `durum=${q(durum)}${hesap ? `&hesap=${q(hesap)}` : ''}&kaynak=${q(kaynak)}&sembol=${q(sembol)}&bas=${q(bas)}&bit=${q(bit)}&tz=${q(new Date().getTimezoneOffset())}&sayfa=${q(sayfa)}`;
  // 68.7: portfoy = kişi süzgeci (yalnız o kişinin hesapları; 'tumu' / boş = hepsi)
  const portfoyumSorgu = ({ hesap = '', islem = '', varlik = '', bas = '', bit = '', durum = '', portfoy = '' } = {}) =>
    `hesap=${q(hesap)}&islem=${q(islem)}&varlik=${q(varlik)}&bas=${q(bas)}&bit=${q(bit)}${durum ? `&durum=${q(durum)}` : ''}${portfoy ? `&portfoy=${q(portfoy)}` : ''}`;

  const api = {
    istek,
    DURUM,
    /** 'yerel' | 'telefon' (60.5; js/pages/kabuk.js sunucudan okuyup yazar). */
    kademe: () => kademe,
    ilkKademe,
    kademeAyarla: (k) => { kademe = k === 'telefon' ? 'telefon' : 'yerel'; },
    TELEFON_MESAJI,
    /** 69.6: (veri) → Promise<boolean> — PIN penceresi (js/core/bildirim.js bağlar). */
    pinIsteyiciAyarla: (fn) => { pinIsteyici = typeof fn === 'function' ? fn : null; },
    /* 69.6 Yerel PIN oturumu (lib/yerelPin.js) */
    yerelPin: {
      durum: () => al('/api/yerel-pin/durum'),
      dogrula: (pin) => istek('/api/yerel-pin/dogrula', { govde: { pin }, pinYineleme: true }),
      kapat: () => istek('/api/yerel-pin/kapat', { yontem: 'POST', pinYineleme: true }),
      /** Düz bağlantıyla yapılan korumalı işlemden (indirme) önce: oturum yoksa PIN sorar. @returns {Promise<boolean>} */
      hazirla: async () => {
        let d;
        try { d = await al('/api/yerel-pin/durum'); } catch (e) { return true; }   // eski sunucu: kapı yok
        if (!d || d.success === false || d.etkin === false || d.oturum || kademe === 'telefon') return true;
        return pinIsteyici ? !!(await pinIsteyici(d)) : false;
      }
    },

    /* ── Durum ve ayar ──────────────────────────────────────────────── */
    durum: () => al('/api/status'),
    /** Canlılık + sunucu rolü (`arastirmaModu`). Bozuksa HTTP 503 ama gövde yine JSON döner. */
    sunucuSagligi: () => al('/api/health'),
    /* 73.0 Ayarlar › Anahtarlar (lib/anahtarlar.js; panel js/pages/anahtarlar.js) — liste MASKELİ; her yazma PIN + onay; telefonda yazma yok */
    anahtarlar: {
      liste: () => al('/api/anahtarlar'),
      hesapEkle: (hesap, pin) => gonder('/api/anahtarlar/hesap', { hesap, pin, onay: true }),
      degistir: (kimlik, alanlar, pin) => gonder('/api/anahtarlar/degistir', { kimlik, alanlar, pin, onay: true }),
      sil: (kimlik, pin) => gonder('/api/anahtarlar/sil', { kimlik, pin, onay: true }),
      sina: (kimlik) => gonder('/api/anahtarlar/sina', { kimlik }),
      kenaraAl: (dosya, pin) => gonder('/api/anahtarlar/eski-kenara-al', { dosya, pin, onay: true }),
      pinDegistir: (eskiPin, yeniPin, yeniPin2) => gonder('/api/anahtarlar/pin-degistir', { eskiPin, yeniPin, yeniPin2, onay: true }),
      bekleyenGonder: (pin, secimler) => gonder('/api/anahtarlar/bekleyen/gonder', { pin, onay: true, ...(secimler ? { secimler } : {}) }),
      bekleyenVazgec: (id) => gonder('/api/anahtarlar/bekleyen/vazgec', { id, onay: true })
    },
    /* 74.3 Veri kalitesi (lib/live/veriKalitesi.js; panel Sistem › Sağlık) — durum telefonda da; kip değişimi yalnız sunucu bilgisayarından + onay */
    veriKalitesi: {
      durum: () => al('/api/veri-kalitesi'),
      kip: (kip) => gonder('/api/veri-kalitesi/kip', { kip, onay: true })
    },
    /* 75.2 Makineler (lib/makine/api.js; panel js/pages/makineler.js) — pano salt okur; eşleme kodu, eşleşme ve kaldır yalnız bilgisayardan + yerel PIN */
    makine: {
      pano: (yenile) => al(`/api/makine/pano${yenile ? '?yenile=1' : ''}`),
      kodUret: (kendiAdres) => gonder('/api/makine/esle/kod', kendiAdres ? { kendiAdres } : {}),
      esleBaslat: (adres, kod, kendiAdres) => gonder('/api/makine/esle-baslat', { adres, kod, kendiAdres }),
      kaldir: (kimlik) => gonder('/api/makine/kaldir', { kimlik }),
      nabizSimdi: () => gonder('/api/makine/nabiz/simdi', {})
    },
    /* 74.2 Ayar geçmişi (lib/ayarGecmisi.js; panel js/pages/ayarGecmisi.js) — liste salt okur; geri al acil PIN (+ gevşetmede "GERİ AL"); telefonda yazma yok */
    ayarGecmisi: {
      liste: (sorgu) => al(`/api/ayar-gecmisi${sorgu || ''}`),
      geriAl: (id, yol, pin, onay) => gonder('/api/ayar-gecmisi/geri-al', { id, yol, pin, ...(onay ? { onay } : {}) })
    },
    /* 61.3 otomatik güncelleme (lib/guncelleme.js): durum · şimdi kontrol et · onay bekleyen güncellemeyi kur */
    guncelleme: {
      durum: () => al('/api/guncelleme/durum'),
      // Telefonda gövdeye { pin, onay: 'GÜNCELLE' } eklenir (lib/acilPin.js kapısı); masaüstünde boş.
      kontrol: (pin) => gonder('/api/guncelleme/kontrol', { ...(pin || {}) }),
      uygula: (hedef, pin) => gonder('/api/guncelleme/uygula', { hedef, ...(pin || {}) })
    },
    kayitlar: () => al('/api/logs'),
    stratejiler: () => al('/api/strategies'),

    ayarOku: () => al('/api/config'),
    /**
     * Ayarın PARÇASINI yazar; sunucu birleştirir.
     *
     * On bir çağrı yeri vardı ve hepsi kısmi nesne gönderiyordu. Tam config
     * göndermek, aradaki başka bir yazımı geri alma riski taşır — bu yüzden
     * fonksiyon "parça" adını taşıyor.
     */
    ayarYaz: (parca) => gonder('/api/config', parca),

    /* ── Piyasa verisi ──────────────────────────────────────────────── */
    mumlar: (symbol, timeframe, limit) =>
      al(`/api/candles?symbol=${q(symbol)}&timeframe=${q(timeframe)}&limit=${limit}`),
    islemler: (symbol, limit) => al(`/api/trades?symbol=${q(symbol)}&limit=${limit || 300}`),
    bakiyeGecmisi: () => al('/api/balance-history'),

    /* ── İzleme listesi ─────────────────────────────────────────────── */
    izlemeListesi: (timeframe) => al(`/api/watchlist?timeframe=${q(timeframe)}`),
    izlemeEkle: (symbol, timeframe) => gonder('/api/watchlist/add', { symbol, timeframe }),
    izlemeCikar: (symbol) => gonder('/api/watchlist/remove', { symbol }),
    izlemeOnyukle: (timeframe) => gonder('/api/watchlist/preload', { timeframe }),

    /* ── Bot ve pozisyon ────────────────────────────────────────────── */
    botCalistir: (strategy, timeframe, symbols) => gonder('/api/bots/run', { strategy, timeframe, symbols }),
    botDurdur: (botId) => gonder('/api/bots/stop', { botId }),
    botHepsiniDurdur: () => tetikle('/api/bots/stop-all'),
    pozisyonKapat: (symbol) => gonder('/api/position/close', { symbol }),

    /* ── Cüzdan ve sıfırlama ────────────────────────────────────────── */
    cuzdanBakiye: (mode, amount) => gonder('/api/wallet/balance', { mode, amount }),
    hepsiniSifirla: () => tetikle('/api/reset-all'),
    killSwitchSifirla: () => tetikle('/api/reset-kill-switch'),

    /* ── Risk ───────────────────────────────────────────────────────── */
    riskDusus: (hours) => al(`/api/risk/drawdown?hours=${q(hours)}`),
    riskGunlukSifirla: () => tetikle('/api/risk/reset-daily'),
    riskKumeTaramasi: (timeframe, period, threshold) =>
      gonder('/api/risk/cluster-scan', { timeframe, period, threshold }),

    /* Backtest panelde iş akışıyla koşar (`js/pages/backtestIs.js` →
       `/api/backtest/is`). Eski senkron uçlar (`/api/backtest`,
       `/optimize`, `/api/strategy-scan`) yalnız `scripts/pine-uc-testi.js` için. */

    /* ── Strateji araştırması (lib/research/) ───────────────────────── */
    stratejiAdaylari: () => al('/api/strateji/adaylar'),
    stratejiOlc: (anahtar, semboller) => gonder('/api/strateji/olc', { anahtar, semboller }),

    /* ── Hücum / Denge (bindirme; yalnız kâğıt borsa) ─────────────────── */
    /** 74.4: bot listesi kayıttan (live/botlar) — Botlar sayfası sekmeleri ve Ayarlar › Botlar bu sırayla. */
    botlar: () => al('/api/botlar'),
    /** 74.5 (A1 2b): bot kaydı yönetimi (Ayarlar › Botlar › Bot kayıtları) — yalnız sunucunun kendi panelinden yazılır. */
    botKayit: {
      liste: () => al('/api/botlar?arsiv=1'),
      sablonlar: () => al('/api/botlar/sablonlar'),
      hesaplar: () => al('/api/botlar/hesaplar'),
      olustur: (govde) => gonder('/api/botlar', { ...govde, onay: true }),
      hesap: (k, mod, hesap, pin) => gonder(`/api/botlar/${q(k)}/hesap`, { mod, hesap, pin, onay: true }),
      sermaye: (k, mod, tutar, pin) => gonder(`/api/botlar/${q(k)}/sermaye`, { mod, tutar, ...(pin ? { pin } : {}), onay: true }),
      arsivle: (k) => gonder(`/api/botlar/${q(k)}/arsivle`, { onay: true }),
      geriGetir: (k) => gonder(`/api/botlar/${q(k)}/geri-getir`, { onay: true })
    },
    bindirmeDurum: (ad) => al(`/api/bindirme/${q(ad)}/durum`),
    bindirmeEylem: (ad, eylem) => tetikle(`/api/bindirme/${q(ad)}/${q(eylem)}`),
    /** Telefondan acil durdurma (60.5): gövdede acil PIN + onay "DURDUR" (sunucu lib/acilPin.js denetler). */
    bindirmeAcil: (ad, pin, onay) => gonder(`/api/bindirme/${q(ad)}/acil`, { pin, onay }),
    bindirmeMod: (ad, mod, onay) => gonder(`/api/bindirme/${q(ad)}/mod`, onay ? { mod, onay } : { mod }),
    bindirmeCanliOnay: (ad, govde) => gonder(`/api/bindirme/${q(ad)}/canli-onay`, govde),
    bindirmeSermayeAkisi: (ad, tutar, not, onay) => gonder(`/api/bindirme/${q(ad)}/sermaye-akisi`, { tutar, not, onay }),
    bindirmeKucukSermaye: (ad, secim) => gonder(`/api/bindirme/${q(ad)}/kucuk-sermaye`, { secim }),
    bindirmeIslemler: (ad, { sayfa = 1, sembol = '', kol = '', bas = '', bit = '', grafikSembol = '' } = {}) =>
      al(`/api/bindirme/${q(ad)}/islemler?sayfa=${q(sayfa)}&sembol=${q(sembol)}&kol=${q(kol)}&bas=${q(bas)}&bit=${q(bit)}&grafikSembol=${q(grafikSembol)}`),
    bindirmeGrafik: (ad) => al(`/api/bindirme/${q(ad)}/grafik?mumsuz=1`),
    /** 64.5: Binance bakiye kırılımı (cüzdan, K/Z, marj, teminatlar, Avbl) + pozisyonlar (mark) + açık/koşullu emirler — yalnız okuma. */
    bindirmeBinanceBakiye: (ad) => al(`/api/bindirme/${q(ad)}/binance-bakiye`),
    /** 68.8: kâğıt hesabı sıfırla (temiz başla) — yalnız kâğıt modda ve bot durmuşken; eski dizin <dizin>-onceki-<zaman> yedeğine taşınır. */
    bindirmeKagitSifirla: (ad, onay, btcAyak) => gonder(`/api/bindirme/${q(ad)}/kagit-sifirla`, btcAyak ? { onay, btcAyak } : { onay }),
    /* Hesap düzeyi kapsayıcı kayıt (data/live/hesap-islemleri.jsonl) */
    hesapIslemleri: ({ hesap = '', bas = '', bit = '', sembol = '', kaynak = '', sayfa = 1 } = {}) =>
      al(`/api/hesap-islemleri?hesap=${q(hesap)}&bas=${q(bas)}&bit=${q(bit)}&sembol=${q(sembol)}&kaynak=${q(kaynak)}&sayfa=${q(sayfa)}`),
    hesapSenkron: () => tetikle('/api/hesap-islemleri/senkron'),

    /* ── Hesaplar (Pusula P3; lib/hesaplar.js — SALT OKUMA birleşik görünüm) ── */
    /** Bağlantılar + TEK pozisyon listesi + açık emirler (borsa okuması sunucuda 15 sn önbellekli; `yenile` önbelleği atlar). */
    hesaplar: (yenile) => al(`/api/hesaplar${yenile ? '?yenile=1' : ''}`),
    /** TEK emir/işlem listesi: durum '' | 'acik' | 'gecmis', kaynak, sembol, bas/bit (YYYY-AA-GG), sayfa. */
    hesaplarIslemler: (f) => al(`/api/hesaplar/islemler?${hesaplarSorgu(f)}`),
    /** Aynı süzgeçle CSV indirme bağlantısı (istek atmaz; <a href download>). */
    hesaplarCsvYolu: (f) => `/api/hesaplar/islemler.csv?${hesaplarSorgu(f)}`,
    /** Hesaplar ekranının elle bağlantısındaki KENDİ açık emrimizi iptal (araştırma modunda sunucu reddeder). */
    borsaEmirIptal: (clientOrderId) => gonder('/api/exchange/cancel', { clientOrderId }),

    /* ── İleri veri testi (gölge izleyici; emir yok) ─────────────────── */
    ileriBollinger: () => al('/api/ileri/bollinger'),
    ileriKabul: () => al('/api/ileri/kabul'),
    /* 64.4 demo kabul raporu (lib/ileri/demoKabulRapor.panelOzet — komut satırıyla aynı hesap; salt okur, hüküm yalnız 63. günden sonra) */
    ileriKabulRapor: () => al('/api/ileri/kabul-rapor'),
    /* 63.7 EUR/USD CBDR gölge testi (lib/ileri/cbdrGolge.js; tasarımcı yönlendiricisinde): kayıt + ara rapor + canlı sıradaki gün */
    ileriCbdr: () => al('/api/ileri/cbdr'),
    /* 64.9 876 gölge + Hücum %90 / 876 %10 (lib/ileri/golge876.js; tasarımcı yönlendiricisinde) — son.json özeti, salt okur */
    ileri876: () => al('/api/ileri/876'),
    /* 73.1 BIST temettü ex-gün gölgesi (deneme 970) ve 2 haftalık momentum kolu gölgesi (deneme 971) — son.json özeti, salt okur */
    ileriTemettu: () => al('/api/ileri/temettu'),
    ileriMomentum: () => al('/api/ileri/momentum'),
    /* 73.2 Kairos-S (1000 $) ayrı emirsiz gölgesi (deneme 972; lib/ileri/hucumSGolge.js) — son.json özeti, salt okur */
    ileriHucumS: () => al('/api/ileri/hucum-s'),
    ileriKairos10x: (anlik) => al(`/api/ileri/kairos-10x${anlik ? '?anlik=1' : ''}`),
    /* 63.3 Sinyaller: BTC trendi + coin sepeti bugün ne diyor (lib/research/sinyaller.js; tasarımcı yönlendiricisinde) — yalnız okur */
    sinyaller: () => al('/api/sinyaller'),

    /* ── Portföy laboratuvarı (lib/portfoy/api.js; panel: js/pages/portfoy.js) ── */
    portfoy: {
      katalog: (s = {}) => al('/api/portfoy/katalog?' + Object.entries(s)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${q(k)}=${q(Array.isArray(v) ? v.join(',') : v)}`).join('&')),
      indir: (kaynak, kod) => gonder('/api/portfoy/indir', kaynak === 'tefas' ? { kaynak, kod } : { kaynak, sembol: kod }),
      simule: (tanim, oturum) => gonder('/api/portfoy/simule', { tanim, oturum }),
      varyasyon: (govde) => gonder('/api/portfoy/varyasyon', govde),
      is: (id) => al(`/api/portfoy/is/${q(id)}`),
      isIptal: (id) => tetikle(`/api/is/${q(id)}/iptal`),
      kararlar: (limit) => al(`/api/portfoy/kararlar?limit=${q(limit || 50)}`),
      portfoyler: () => al('/api/portfoy/portfoyler'),
      portfoyKaydet: (ad, tanim, aciklama) => gonder('/api/portfoy/portfoyler', { ad, tanim, aciklama }),
      portfoySil: (ad) => istek(`/api/portfoy/portfoyler/${q(ad)}`, { yontem: 'DELETE' }),
      denemeler: (oturum) => al(`/api/portfoy/denemeler?oturum=${q(oturum || '')}`),
      denemeSifirla: (oturum) => gonder('/api/portfoy/denemeler/sifirla', { oturum }),
      guncelleme: () => al('/api/portfoy/guncelleme'),
      guncelle: () => tetikle('/api/portfoy/guncelle')
    },

    /* ── Portföyüm (lib/portfoyum/api.js, 60.8; panel: js/pages/portfoyum.js, kurCevirici.js) — yazma telefonda sunucuya gitmez ── */
    portfoyum: {
      // Yeni panel F3/F4: portfoy = 'ben' | <kimlik> | 'tumu' (yoksa eski davranış: bütün hesaplar)
      ozet: (portfoy) => al('/api/portfoyum/ozet' + (portfoy ? `?portfoy=${q(portfoy)}` : '')),
      islemler: (f) => al('/api/portfoyum/islemler?' + portfoyumSorgu(f)),
      /** CSV indirme bağlantısı (istek atmaz; <a href download>). */
      csvYolu: (f) => '/api/portfoyum/islemler.csv?' + portfoyumSorgu(f),
      /** 68.7 İşlem defteri › Yatırım grafikleri (yalnız okuma): portfoy, hesap, bas, bit. */
      defterAnaliz: ({ portfoy = '', hesap = '', bas = '', bit = '' } = {}) => al(`/api/portfoyum/defter-analiz?portfoy=${q(portfoy)}&hesap=${q(hesap)}&bas=${q(bas)}&bit=${q(bit)}`),
      gecmis: (hesap, portfoy) => al('/api/portfoyum/gecmis' + (hesap ? `?hesap=${q(hesap)}` : portfoy ? `?portfoy=${q(portfoy)}` : '')),
      /* 62.4 Portföyüm grafiğinin kıyas çizgileri (100 tabanlı, USD | TL) */
      kiyas: (bas, birim) => al(`/api/portfoyum/kiyas?bas=${q(bas)}&birim=${q(birim || 'USD')}`),
      // 64.2 Rapor sekmesi (yalnız okuma; telefonda da açık) — ay: 'YYYY-AA' | 'buay' | boş (son biten ay)
      rapor: ({ ay = '', hesap = '', portfoy = '' } = {}) => al(`/api/portfoyum/rapor?ay=${q(ay)}&hesap=${q(hesap)}${portfoy && !hesap ? `&portfoy=${q(portfoy)}` : ''}`),
      kur: (yenile) => al(`/api/portfoyum/kur${yenile ? '?yenile=1' : ''}`),
      kurumEkle: (ad) => gonder('/api/portfoyum/kurum', { ad }),
      kurumAd: (id, ad) => istek(`/api/portfoyum/kurum/${q(id)}`, { yontem: 'PUT', govde: { ad } }),
      hesapEkle: (g) => gonder('/api/portfoyum/hesap', g),
      hesapAd: (id, ad) => istek(`/api/portfoyum/hesap/${q(id)}`, { yontem: 'PUT', govde: { ad } }),
      hesapKapat: (id, tarih) => gonder(`/api/portfoyum/hesap/${q(id)}/kapat`, { tarih }),
      hesapFaiz: (id, g) => gonder(`/api/portfoyum/hesap/${q(id)}/faiz`, g),   // 64.2 mevduat faizi ayarı
      varlikEkle: (g) => gonder('/api/portfoyum/varlik', g),
      varlikGuncelle: (id, g) => istek(`/api/portfoyum/varlik/${q(id)}`, { yontem: 'PUT', govde: g }),
      islemEkle: (g) => gonder('/api/portfoyum/islem', g),
      /** Ters kayıt (düzeltme): kayıt silinmez, iptal işaretlenir. */
      iptal: (id, neden) => gonder(`/api/portfoyum/kayit/${q(id)}/iptal`, { neden }),
      fiyatEkle: (g) => gonder('/api/portfoyum/fiyat', g),
      hedefKaydet: (g) => gonder('/api/portfoyum/hedef', g),
      // Yeni panel F3: portföy (sahip) katmanı
      portfoyEkle: (ad) => gonder('/api/portfoyum/portfoy', { ad }),
      portfoyAd: (id, ad) => istek(`/api/portfoyum/portfoy/${q(id)}`, { yontem: 'PUT', govde: { ad } }),
      hesapPortfoy: (id, g) => gonder(`/api/portfoyum/hesap/${q(id)}/portfoy`, g),
      hesapKapsam: (id, dahil) => gonder(`/api/portfoyum/hesap/${q(id)}/kapsam`, { dahil }),
      csvOnizle: (metin) => gonder('/api/portfoyum/csv/onizle', { metin }),
      csvIceAktar: (metin) => gonder('/api/portfoyum/csv/ice-aktar', { metin }),
      fiyatYenile: () => gonder('/api/portfoyum/fiyat-yenile', {}),
      /* 61.2 hızlı ekleme: sembol ara (Yahoo) · tek adımda hesap + varlık + açılış · açılışı düzenle (ters kayıt + yenisi) */
      sembolBul: (q) => gonder('/api/portfoyum/sembol-bul', { q }),
      hizliEkle: (g) => gonder('/api/portfoyum/hizli-ekle', g),
      hizliDuzenle: (g) => gonder('/api/portfoyum/hizli-duzenle', g),
      /* 67.3 Hedefim › Para ekle planı: yatırma + satışlar + alışlar tek pakette (atomik; nakit eksiye düşerse 409 soru 'nakit-eksi') */
      planKaydet: (g) => gonder('/api/portfoyum/plan-kaydet', g)
    },

    /* ── 64.8 Sunucuya yazma kuyruğu + Portföyüm bir kezlik taşıma (lib/evYazma.js; yalnız geliştirme bilgisayarında anlamlı) ── */
    evKuyruk: {
      durum: () => al('/api/ev-kuyruk'),
      gonder: () => gonder('/api/ev-kuyruk/gonder', {}),
      cikar: (id) => gonder(`/api/ev-kuyruk/${q(id)}/cikar`, {}),
      tasimaDurum: () => al('/api/ev-tasima/portfoyum'),
      tasimaOnizle: () => gonder('/api/ev-tasima/portfoyum/onizle', {}),
      tasimaOnayla: () => gonder('/api/ev-tasima/portfoyum/onayla', {})
    },

    /* ── İşlem defterim (lib/islemDefteri/api.js, 64.7; panel js/pages/islemDefteri.js) — GET sunucudan da okunur; yazma telefonda sunucuya gitmez ── */
    islemDefteri: {
      ozet: (hesap) => al('/api/islem-defteri/ozet' + (hesap ? `?hesap=${q(hesap)}` : '')),
      islemler: ({ hesap = '', sembol = '', bas = '', bit = '', yon = '', kaynak = '', tur = '', sayfa = 1, boyut = 50 } = {}) =>
        al(`/api/islem-defteri/islemler?hesap=${q(hesap)}&sembol=${q(sembol)}&bas=${q(bas)}&bit=${q(bit)}&yon=${q(yon)}&kaynak=${q(kaynak)}&tur=${q(tur)}&sayfa=${q(sayfa)}&boyut=${q(boyut)}`),
      fiyat: (sembol, hesap) => al(`/api/islem-defteri/fiyat?sembol=${q(sembol)}&hesap=${q(hesap || '')}`),
      // Yeni panel F4 (K-E): OKX / Binance bugünkü bakiyesi (salt okuma; 10 dk önbellek)
      bakiye: (yenile) => al('/api/islem-defteri/bakiye' + (yenile ? '?yenile=1' : '')),
      hesapEkle: (g) => gonder('/api/islem-defteri/hesap', g),
      hesapGuncelle: (id, g) => gonder(`/api/islem-defteri/hesap/${q(id)}`, g),
      onizle: (g) => gonder('/api/islem-defteri/onizle', g),
      yukle: (g) => gonder('/api/islem-defteri/yukle', g),
      geriAl: (id, neden) => gonder(`/api/islem-defteri/yukleme/${q(id)}/geri-al`, { neden }),
      iptal: (id, neden) => gonder(`/api/islem-defteri/kayit/${q(id)}/iptal`, { neden }),
      okxAnahtar: (g) => gonder('/api/islem-defteri/okx/anahtar', g),
      okxAnahtarSil: (hesap) => gonder('/api/islem-defteri/okx/anahtar-sil', { hesap }),
      okxEsitle: (hesap) => gonder('/api/islem-defteri/okx/esitle', { hesap }),
      binanceAnahtar: (g) => gonder('/api/islem-defteri/binance/anahtar', g),
      binanceAnahtarSil: (hesap) => gonder('/api/islem-defteri/binance/anahtar-sil', { hesap }),
      binanceEsitle: (hesap) => gonder('/api/islem-defteri/binance/esitle', { hesap })
    },

    /* ── Portföy tasarımcısı (lib/tasarimci/api.js, F2; panel F3; Bu ay emirleri F4) — GET'ler yalnız okur; yazma telefonda sunucuya gitmez ── */
    tasarimci: {
      durum: () => al('/api/tasarimci/durum'),
      /* 61.4 kâğıt hesaplar (lib/tasarimci/kagit.js) — yalnız okur, telefonda da açık */
      kagit: (model) => al('/api/tasarimci/kagit' + (model ? `?model=${encodeURIComponent(model)}` : '')),
      /* 62.3 Model portföyler: aday havuzu (sıradaki kararın önizlemesi) + geçmiş (backtest) eğrisi — yalnız okur */
      adayHavuzu: () => al('/api/tasarimci/aday-havuzu'),
      gecmis: (id) => al(`/api/tasarimci/gecmis/${q(id)}`),
      katalog: () => al('/api/tasarimci/katalog'),
      modeller: () => al('/api/tasarimci/modeller'),
      model: (id) => al(`/api/tasarimci/model/${q(id)}`),
      kararlar: (id) => al(`/api/tasarimci/model/${q(id)}/kararlar`),
      oneri: () => al('/api/tasarimci/oneri'),
      emirler: ({ ay = '', model = '' } = {}) => { const p = [ay ? 'ay=' + q(ay) : '', model ? 'model=' + q(model) : ''].filter(Boolean).join('&'); return al('/api/tasarimci/emirler' + (p ? '?' + p : '')); },
      yenile: () => gonder('/api/tasarimci/yenile', {}),
      /* F4 (61.0) — yazma; telefon kademesinde sunucuya gitmez (kademe reddi), sunucu da 403 verir */
      sermaye: (g) => gonder('/api/tasarimci/sermaye', g),
      uygula: (ay, g) => gonder(`/api/tasarimci/emirler/${q(ay)}/uygula`, g),
      atla: (ay, g) => gonder(`/api/tasarimci/emirler/${q(ay)}/atla`, g),
      geriAl: (ay, g) => gonder(`/api/tasarimci/emirler/${q(ay)}/geri-al`, g),
      hedefAktar: (g) => gonder('/api/tasarimci/hedef-aktar', g),
      tasarimlar: () => al('/api/tasarimci/tasarimlar'),
      tasarim: (g) => gonder('/api/tasarimci/tasarim', g),
      /* 68.8 Botlar › portföy botları (lib/tasarimci/portfoyBot.js) — yalnız okur; geliştirme bilgisayarında sunucudan (lib/evOkuma.js) */
      portfoyBotlar: () => al('/api/tasarimci/portfoy-botlar'),
      portfoyBot: (id) => al(`/api/tasarimci/portfoy-bot/${q(id)}`),
      portfoyBotFiyat: (id, s) => al(`/api/tasarimci/portfoy-bot/${q(id)}/fiyat?s=${q(s)}`),
      /* F5 (61.1) — model ↔ gerçek; yalnız GET. disariUrl indirme bağlantısıdır (a href download — fetch değil) */
      fark: (id, ay) => al(`/api/tasarimci/model/${q(id)}/fark${ay ? '?ay=' + q(ay) : ''}`),
      aylik: () => al('/api/tasarimci/aylik'),
      disari: () => al('/api/tasarimci/disari'),
      disariUrl: (ay, tur = 'json', tutarli = false) => `/api/tasarimci/disari/${q(ay)}.${tur === 'csv' ? 'csv' : 'json'}${tutarli && tur === 'csv' ? '?tutarli=1' : ''}`
    },

    /* ── Veri orkestratörü (lib/veri/orkestrator.js): kaynak tablosu + elle güncelleme. Portföy; ileride Ana sayfa / Pusula ── */
    veri: {
      durum: () => al('/api/veri/durum'),
      guncelle: (kaynak, zorla) => gonder('/api/veri/guncelle', kaynak ? { kaynak, zorla: !!zorla } : { zorla: !!zorla })
    },
    /* 73.3 İleriye kayıt (lib/ileriKayit): sunucunun ham veri kayıtçıları — salt okur (araştırma kopyasında sunucudan, lib/evOkuma) */
    ileriKayit: { durum: () => al('/api/ileri-kayit/durum') },
    /* 73.9 Piyasa bağlamı (lib/piyasaBaglami): yalnız bilgi kartları + Ana sayfa 'Bu hafta' — salt okur (araştırma kopyasında sunucudan) */
    piyasaBaglami: { ozet: () => al('/api/piyasa-baglami'), hafta: () => al('/api/piyasa-baglami/hafta') },
    /* 74.1 Yapay zekâ notları (lib/yapayZeka): salt okur (araştırma kopyasında sunucudan, lib/evOkuma) */
    yapayZeka: { notlar: (gun) => al(`/api/yapay-zeka/notlar${gun ? `?gun=${encodeURIComponent(gun)}` : ''}`), durum: () => al('/api/yapay-zeka/durum') },

    /* ── Coin tarama + liste kaydı (lib/tarama, 60.3; panel: js/pages/tarama.js, listeler.js) ── */
    tarama: {
      durum: () => al('/api/tarama/durum'),
      is: () => al('/api/tarama/is'),
      tara: () => gonder('/api/tarama/tara', {}),
      /** Panel açıldı: son başarılı tarama otomatik aralıktan eskiyse sunucu arka planda başlatır. */
      otomatik: () => gonder('/api/tarama/otomatik', {}),
      ozet: () => al('/api/tarama/ozet'),
      coin: (id, limit) => al(`/api/tarama/coin/${q(id)}?limit=${q(limit || 14)}`),
      uyarilar: () => al('/api/tarama/uyarilar'),
      ayarlar: () => al('/api/tarama/ayarlar'),
      ayarYaz: (yama) => gonder('/api/tarama/ayarlar', { yama }),
      izleme: (islem, coin) => gonder('/api/tarama/izleme', { islem, coin }),
      denetim: (limit) => al(`/api/tarama/denetim?limit=${q(limit || 100)}`),
      /** Dikkat listesi kaynakları (60.7): son durum, 30 g başarı, kota, bozulma haritası — Veri ekranı. */
      kaynakSagligi: () => al('/api/tarama/kaynak-sagligi'),
      /** Günlük ham arşiv (dikkat F1): resmî / deneme manifest zinciri, kesintisiz gün, boşluklar, son koşu — Veri ekranı. */
      arsiv: () => al('/api/tarama/arsiv'),
      yenidenUret: () => gonder('/api/tarama/yeniden-uret', {})
    },
    /* ── Dikkat listesi F2 (lib/tarama/dikkatPanel.js, 64.1; panel: js/pages/dikkat.js) — salt okuma ── */
    dikkat: {
      kurallar: () => al('/api/dikkat/kurallar'),
      durum: (kip) => al(`/api/dikkat/durum${kip ? `?kip=${q(kip)}` : ''}`),
      liste: (o) => { const s = o || {}; const p = [s.kip ? `kip=${q(s.kip)}` : '', s.gun ? `gun=${q(s.gun)}` : '', s.tur ? `tur=${q(s.tur)}` : ''].filter(Boolean).join('&'); return al(`/api/dikkat/liste${p ? `?${p}` : ''}`); },
      coin: (anahtar, kip) => al(`/api/dikkat/coin?anahtar=${q(anahtar)}${kip ? `&kip=${q(kip)}` : ''}`),
      pencereler: (kip, isinma) => al(`/api/dikkat/pencereler?${[kip ? `kip=${q(kip)}` : '', isinma == null ? '' : `isinma=${isinma ? 1 : 0}`].filter(Boolean).join('&')}`)
    },
    /* ── İZLE (781) + puan gölgesi (782) (lib/tarama/izlePanel.js, 64.3; panel: js/pages/izle.js) — salt okuma; coin ayrıntısı dikkat.coin ── */
    izle: {
      durum: (kip) => al(`/api/izle/durum${kip ? `?kip=${q(kip)}` : ''}`),
      liste: (o) => { const s = o || {}; const p = [s.kip ? `kip=${q(s.kip)}` : '', s.gun ? `gun=${q(s.gun)}` : ''].filter(Boolean).join('&'); return al(`/api/izle/liste${p ? `?${p}` : ''}`); }
    },
    listeler: {
      liste: () => al('/api/listeler'),
      dogrula: () => al('/api/listeler/dogrula'),
      ekle: (govde) => gonder('/api/listeler', govde),
      duzelt: (govde) => gonder('/api/listeler/duzeltme', govde),
      degerlendir: (no, bas) => al(`/api/listeler/${q(no)}/degerlendirme${bas ? `?bas=${q(bas)}` : ''}`),
      piyasa: (gun) => gonder('/api/listeler/piyasa', { gun }),
      piyasaIs: () => al('/api/listeler/piyasa-is'),
      piyasaIptal: () => gonder('/api/listeler/piyasa-iptal', {})
    },
    /* ── Araştırma defteri (lib/defter.js, 60.6; panel: js/pages/defter.js) — POST telefonda sunucuya gitmez ── */
    defter: {
      liste: () => al('/api/defter'),
      ekle: (kayit) => gonder('/api/defter', kayit)
    },
    /* ── Günlükler (lib/gunluk.js, PLAN-PANEL-2; panel: js/pages/gunluk.js) — salt okuma ── */
    gunluk: {
      liste: (q) => al('/api/gunluk' + (q ? '?' + new URLSearchParams(q).toString() : '')),
      csvYolu: (q) => '/api/gunluk.csv' + (q ? '?' + new URLSearchParams(q).toString() : '')
    },
    /* ── Bildirim merkezi (lib/bildirimMerkezi.js, PLAN-PANEL-2; panel: js/pages/bildirimMerkezi.js) ── */
    bildirim: {
      liste: () => al('/api/bildirim'),
      ayarla: (tur, acik) => gonder('/api/bildirim/ayar', { tur, acik }),
      // 73.5: tür ayarı { tur, acik?, metin?, kanal?, sessiz? }, sessiz saat, yeni türlerin ayarı, yan etkisiz önizleme
      tur: (g) => gonder('/api/bildirim/tur', g),
      sessiz: (g) => gonder('/api/bildirim/sessiz', g),
      uretici: (g) => gonder('/api/bildirim/uretici', g),
      onizle: (tur, metin) => gonder('/api/bildirim/onizle', { tur, metin }),
      // 74.1: genel ayar (Telegram'da tutarları gizle) ve geçici sessizi erken bitirme
      genel: (g) => gonder('/api/bildirim/genel', g),
      geciciBitir: () => gonder('/api/bildirim/gecici-bitir', {})
    },
    /* ── Raporlar (lib/rapor.js, PLAN-PANEL-2; panel: js/pages/raporlar.js) ── */
    rapor: {
      getir: (tur, bas) => al('/api/rapor?' + new URLSearchParams(bas ? { tur, bas } : { tur: tur || 'gunluk' }).toString()),
      olustur: (tur, gun, telegram) => gonder('/api/rapor/olustur', { tur, gun, telegram: !!telegram })
    },
    /* ── Kurulum sihirbazı (lib/kurulum.js, PLAN-PANEL-2; panel: js/pages/kurulum.js) ── */
    kurulum: {
      durum: () => al('/api/kurulum'),
      onayla: (surum, maddeler) => gonder('/api/kurulum/onay', { surum, maddeler }),
      tamamla: () => gonder('/api/kurulum/tamam', {})
    },
    /* ── Kurulum denetimi (lib/kurulumDenetimi.js, 68.3 PLAN-TASIMA F4; panel: js/pages/kurulumDenetimi.js) — Onar yalnız yerel kademe ── */
    kurulumDenetimi: {
      durum: () => al('/api/kurulum-denetimi'),
      onar: (adim) => gonder('/api/kurulum-denetimi/onar', { adim })
    },
    /* ── Yedek ve taşıma (lib/tasimaApi.js, 68.1 PLAN-TASIMA F3; panel: js/pages/tasima.js) — yalnız yerel kademe ── */
    tasima: {
      durum: () => al('/api/tasima/durum'),
      tahmin: () => al('/api/tasima/tahmin'),
      olustur: (govde) => gonder('/api/tasima/olustur', govde),
      is: () => al('/api/tasima/is'),
      indirYolu: (ad) => `/api/tasima/indir/${q(ad)}`,
      sil: (ad) => tetikle(`/api/tasima/sil/${q(ad)}`),
      /** Dosyayı ham gövdeyle (akış) yükler — JSON değil. Telefonda istek(…) gibi reddedilir. */
      yukle: async (dosya) => {
        if (kademe === 'telefon') { const red = { success: false, kademe: 'telefon', error: TELEFON_MESAJI }; Object.defineProperty(red, DURUM, { value: 403, enumerable: false }); return red; }
        if (!(await api.yerelPin.hazirla())) { const red = { success: false, kod: 'pin-gerekli', error: 'PIN girilmedi — yükleme yapılmadı.' }; Object.defineProperty(red, DURUM, { value: 403, enumerable: false }); return red; }   // 69.6: akış gövdesi yinelenemez → önce oturum
        const res = await global.fetch('/api/tasima/yukle', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-dosya-adi': encodeURIComponent((dosya && dosya.name) || 'dosya.pusula') }, body: dosya });
        const m = await res.text();
        let v; try { v = JSON.parse(m); } catch (e) { throw new Error(`POST /api/tasima/yukle → HTTP ${res.status}: ${m.slice(0, 120)}`); }
        Object.defineProperty(v, DURUM, { value: res.status, enumerable: false });
        return v;
      },
      yerel: (yol) => gonder('/api/tasima/yerel', { yol }),
      onizle: (kimlik, sifre, beklenenTur) => gonder('/api/tasima/onizle', { kimlik, sifre, beklenenTur }),
      uygula: (kimlik, mod) => gonder('/api/tasima/uygula', { kimlik, mod }),
      vazgec: (kimlik) => gonder('/api/tasima/vazgec', { kimlik }),
      yedekSifre: (sifre, sifreTekrar) => gonder('/api/tasima/yedek-sifre', { sifre, sifreTekrar })
    },

    /* ── Göstergeler ────────────────────────────────────────────────── */
    gostergeKatalogu: () => al('/api/indicators'),
    gostergeHesapla: (yuk) => gonder('/api/indicators/compute', yuk),
    gostergeHesaplaCoklu: (yuk) => gonder('/api/indicators/compute-multi', yuk),

    /* ── Pine ───────────────────────────────────────────────────────── */
    pineListe: () => al('/api/pine'),
    pineOku: (anahtar) => al(`/api/pine/${q(anahtar)}`),
    pineIncele: (yuk) => gonder('/api/pine/inspect', yuk),
    pineKaydet: (yuk) => gonder('/api/pine/save', yuk),
    pineSil: (anahtar) => istek(`/api/pine/${q(anahtar)}`, { yontem: 'DELETE' }),

    /* ── Diğer ──────────────────────────────────────────────────────── */
    telegramTest: () => tetikle('/api/telegram/test'),
    /* Sağlık sinyali (healthchecks.io): URL'ler sırdır → /api/secrets (yalnız yazılır). */
    saglikKaydet: (govde) => gonder('/api/secrets', govde),
    saglikTest: () => tetikle('/api/saglik/test'),
    /* Ayarlar › Bu bilgisayar (denetim A-18): healthchecks + Telegram komut yoklaması durumu (salt okuma). */
    saglikDurum: () => al('/api/saglik/durum'),
    /* 69.1 Öz denetim (lib/ozDenetim.js; panel: js/pages/saglik.js) — tam kapanmayı açmak: bindirmeEylem(ad, 'engel-kaldir') */
    saglikOz: {
      durum: () => al('/api/saglik/oz'),
      yokla: () => tetikle('/api/saglik/oz/yokla'),
      guvenliKipKaldir: (ad) => tetikle(`/api/saglik/oz/${q(ad)}/guvenli-kip-kaldir`),
      /* 69.2 olay raporu (kara kutu): ad = bot ya da 'sistem' */
      karaKutuAl: (ad) => tetikle(`/api/saglik/kara-kutu/${q(ad || 'sistem')}`),
      karaKutuYolu: (dosya) => `/api/saglik/kara-kutu/dosya/${q(dosya)}`,
      /* 69.4 ikinci uyarı kanalı (ntfy) + ikinci ölü adam */
      ikinciKanal: () => al('/api/saglik/ikinci-kanal'),
      ikinciKanalKaydet: (govde) => gonder('/api/saglik/ikinci-kanal', govde),
      ikinciKanalDene: () => tetikle('/api/saglik/ikinci-kanal/dene')
    },
    /* 73.7 Sorun merkezi (lib/sorunlar.js; panel: js/pages/sorunlar.js) — yalnız okuma; eylemler mevcut uçlarla (bindirmeEylem, saglikOz) */
    sorunlar: {
      liste: (o) => al(`/api/sorunlar${o && o.ornek ? '?ornek=1' : o && o.taze ? '?taze=1' : ''}`),
      yerel: () => al('/api/sorunlar/yerel'),
      teshis: (kart) => al(`/api/sorunlar/teshis${kart ? `?kart=${q(kart)}` : ''}`)
    },
    /* 73.8 Sorun araçları (lib/sorunAraclari.js): önizleme → PIN + onay metni + parmak izi; 409 = durum değişti (yeni önizleme gövdede) */
    sorunArac: {
      onizle: (arac, bot, sembol) => al(`/api/sorun-arac/${q(arac)}/onizle?bot=${q(bot)}${sembol ? `&sembol=${q(sembol)}` : ''}`),
      uygula: (arac, govde) => istek(`/api/sorun-arac/${q(arac)}/uygula`, { govde, pinYineleme: true })
    },

    /* ── Kılavuz (60.4; panel: js/pages/kilavuz.js) — durağan dosyalar public/kilavuz/ altında ── */
    kilavuz: {
      dizin: () => al('kilavuz/kilavuz.json'),
      ekranlar: () => al('kilavuz/ekranlar.json'),
      /** Bölüm Markdown'u DÜZ METİN olarak (JSON değil); işleyen AG.md — HTML olarak yorumlanmaz. */
      bolum: (dosya) => metinAl('kilavuz/' + String(dosya).replace(/[^a-z0-9\-/.]/gi, '').replace(/\.\./g, ''))
    }
  };

  global.AG = global.AG || {};
  global.AG.api = api;

  // Node tarafındaki denetim için; tarayıcıda `module` yok.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
