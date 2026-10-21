/**
 * BİLDİRİM ve ONAY — `alert()` / `confirm()` yerine (`AG.bildir`, `AG.onayla`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tarayıcının kendi kutuları sayfayı KİLİTLER: açıkken WebSocket akışı
 * ekrana yansımaz, fiyatlar donar ve kutu kapanınca bir anda sıçrar. Trade
 * panelinde bu, kullanıcının eski bir fiyata bakarak onay vermesi demek.
 *
 *   AG.bildir(metin, tur?, secenek?)
 *       tur: 'bilgi' | 'ok' | 'uyari' | 'hata'   (varsayılan 'bilgi')
 *       secenek: { baslik?, sure? }  sure ms; 0 = kendiliğinden kapanmaz.
 *       Hata bildirimleri varsayılan olarak KENDİLİĞİNDEN KAPANMAZ —
 *       okunmadan kaybolan hata, hiç gösterilmemiş hatadır.
 *
 *   await AG.onayla({ baslik, metin, onay?, iptal?, tehlikeli? })  → true|false
 *       Erişilebilir modal: role="dialog" + aria-modal, odak içeride tutulur,
 *       Esc = vazgeç, kapanınca odak eski yerine döner. Tehlikeli işlemde
 *       ilk odak VAZGEÇ düğmesindedir: Enter'a yanlışlıkla basmak işlemi
 *       yapmamalı.
 *
 *   AG.bildirim.hataKutusu(metin, { baslik?, yeniden? })  → eleman
 *       EKRAN VERİSİ yüklenemediğinde verinin yerine konan tek tip kutu
 *       (`.hata-kutu`, role="alert"; isteğe bağlı "Yeniden dene"). Anlık bir
 *       işlemin (düğme) hatası ise AG.bildir(…, 'hata') — kural (Pusula P5):
 *       kullanıcının yaptığı iş → bildirim; ekranın kendi verisi → kutu.
 *
 * Metinler `textContent` ile yazılır (AG.dom.el) — sunucudan gelen hata
 * mesajı işaretleme olarak yorumlanmaz.
 */
(function (global) {
  'use strict';

  const AG = global.AG || (global.AG = {});
  const doc = global.document;
  const el = (t, p, c) => AG.dom.el(t, p, c);

  const TURLER = { bilgi: 'toast-bilgi', ok: 'toast-ok', uyari: 'toast-uyari', hata: 'toast-hata' };

  /** Eski `alert('✅ …')` / `alert('❌ …')` metinlerinden tür çıkarır. */
  function turTahmin(metin) {
    const s = String(metin || '').trim();
    if (/^(✅|✔)/.test(s)) return 'ok';
    if (/^(❌|⛔|✖)/.test(s)) return 'hata';
    if (/^(⚠)/.test(s)) return 'uyari';
    if (/(hata|başarısız|edilemedi|yapılamadı|ulaşılamıyor|kaydedilemedi|yüklenemedi|silinemedi|eklenemedi|çalıştırılamadı|durdurulamadı|başlatılamadı|aktarılamadı|gönderilemedi|güncellenemedi|değiştirilemedi|kapatılamadı)/i.test(s)) return 'hata';
    return 'bilgi';
  }

  let bolge = null;
  function bolgeAl() {
    if (bolge && doc.body.contains(bolge)) return bolge;
    bolge = el('div', { class: 'toast-region', 'aria-live': 'polite', 'aria-atomic': 'false' });
    doc.body.appendChild(bolge);
    return bolge;
  }

  function bildir(metin, tur, secenek) {
    if (!doc || !doc.body) return null;
    const t = TURLER[tur] ? tur : turTahmin(metin);
    const opt = secenek || {};
    const sure = opt.sure !== undefined ? opt.sure : (t === 'hata' ? 0 : 5000);
    // Baştaki ✅/❌ simgesi artık kenar rengiyle söyleniyor; metinde tekrar etmesin.
    const temiz = String(metin === undefined || metin === null ? '' : metin).replace(/^\s*(✅|❌|⚠️|⚠|⛔)\s*/, '');

    const kapat = el('button', { type: 'button', class: 'toast-close', 'aria-label': 'Bildirimi kapat', text: '×' });
    const govde = el('div', { class: 'toast-body' }, [
      opt.baslik ? el('strong', { class: 'toast-title', text: opt.baslik }) : null,
      doc.createTextNode(temiz)
    ]);
    const kutu = el('div', {
      class: 'toast ' + TURLER[t],
      role: t === 'hata' ? 'alert' : 'status'
    }, [govde, kapat]);

    let zaman = null;
    const sil = () => { if (zaman) clearTimeout(zaman); if (kutu.parentNode) kutu.parentNode.removeChild(kutu); };
    kapat.addEventListener('click', sil);
    const r = bolgeAl();
    r.appendChild(kutu);
    // En fazla 5 bildirim: en eskisi düşer.
    while (r.children.length > 5) r.removeChild(r.firstChild);
    if (sure > 0) zaman = setTimeout(sil, sure);
    return { kapat: sil, eleman: kutu };
  }

  let sayac = 0;
  /**
   * Onay penceresi. `alanlar` verilirse (60.5, telefondan acil durdurma: PIN + "DURDUR") pencerede giriş
   * kutuları çıkar; onay düğmesi her alanın `dogrula(deger)`ı doğru olana kadar KAPALIDIR ve söz
   * `{ <ad>: değer, … }` ile çözülür (vazgeçince `false`). Alansız kullanım değişmedi (true/false).
   *   alanlar: [{ ad, etiket, tip ('text'|'password'), inputmode, ipucu, deger? (başlangıç değeri), dogrula: (s) → bool }]
   * `secenekler` verilirse (60.8, Portföyüm soruları) tek onay düğmesi yerine her seçenek için bir düğme çıkar; söz o seçeneğin
   * `deger`iyle çözülür. Vazgeç, Esc ve pencere dışına tıklama HER ZAMAN `false` (iptal = iptal; hiçbir seçenek seçilmiş sayılmaz).
   * Odak Vazgeç'te başlar (Enter yanlışlıkla bir seçeneği seçmesin).
   *   secenekler: [{ deger, metin, birincil? }]
   */
  function onayla(opt) {
    const o = opt || {};
    return new Promise(resolve => {
      if (!doc || !doc.body) { resolve(false); return; }
      const id = 'agOnay' + (++sayac);
      const onceki = doc.activeElement;

      const iptalBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: o.iptal || 'Vazgeç' });
      const onayBtn = el('button', {
        type: 'button',
        class: 'btn ' + (o.tehlikeli ? 'btn-danger' : 'btn-primary'),
        text: o.onay || 'Onayla'
      });

      const secenekler = (o.secenekler || []).map(x => ({ x, dugme: el('button', { type: 'button', class: 'btn ' + (x.birincil ? 'btn-primary' : 'btn-secondary'), text: x.metin || String(x.deger) }) }));
      const alanlar = (o.alanlar || []).map((a, i) => {
        const girdi = el('input', {
          type: a.tip || 'text', class: 'form-control modal-girdi', id: `${id}A${i}`, autocomplete: 'off',
          autocapitalize: 'off', spellcheck: 'false', inputmode: a.inputmode || null, placeholder: a.ipucu || null
        });
        if (a.deger != null) girdi.value = String(a.deger);   // 68.4: başlangıç değeri (ör. var olan fiyat kodu)
        return { a, girdi, kutu: el('label', { class: 'modal-alan', for: `${id}A${i}` }, [el('span', { class: 'modal-alan-etiket', text: a.etiket || a.ad }), girdi]) };
      });
      const gecerli = () => alanlar.every(x => typeof x.a.dogrula !== 'function' || x.a.dogrula(String(x.girdi.value || '')));
      const durumGuncelle = () => { onayBtn.disabled = alanlar.length > 0 && !gecerli(); };
      alanlar.forEach(x => x.girdi.addEventListener('input', durumGuncelle));
      durumGuncelle();

      const kutu = el('div', {
        class: 'modal' + (o.tehlikeli ? ' modal-danger' : ''),
        role: o.tehlikeli ? 'alertdialog' : 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': id + 'B',
        'aria-describedby': id + 'M'
      }, [
        el('h2', { class: 'modal-title', id: id + 'B', text: o.baslik || 'Onay' }),
        el('p', { class: 'modal-text', id: id + 'M', text: o.metin || '' }),
        alanlar.length ? el('div', { class: 'modal-alanlar' }, alanlar.map(x => x.kutu)) : null,
        el('div', { class: 'modal-actions' }, [iptalBtn].concat(secenekler.length ? secenekler.map(x => x.dugme) : [onayBtn]))
      ]);
      const perde = el('div', { class: 'modal-backdrop' }, [kutu]);

      let bitti = false;
      function bitir(sonuc) {
        if (bitti) return;
        bitti = true;
        doc.removeEventListener('keydown', tus, true);
        if (perde.parentNode) perde.parentNode.removeChild(perde);
        if (onceki && typeof onceki.focus === 'function') { try { onceki.focus(); } catch (e) { /* yok */ } }
        resolve(sonuc);
      }

      const onayla_ = () => {
        if (!alanlar.length) { bitir(true); return; }
        if (!gecerli()) return;
        const degerler = {};
        alanlar.forEach(x => { degerler[x.a.ad] = String(x.girdi.value || ''); });
        bitir(degerler);
      };

      function tus(e) {
        if (e.key === 'Escape') { e.preventDefault(); bitir(false); return; }
        if (e.key === 'Enter' && alanlar.some(x => x.girdi === doc.activeElement)) { e.preventDefault(); onayla_(); return; }
        if (e.key === 'Tab') {
          // Odak tuzağı: alanlar + iki düğme arasında döner, sayfaya kaçmaz.
          const sira = [...alanlar.map(x => x.girdi), iptalBtn].concat(secenekler.length ? secenekler.map(x => x.dugme) : [onayBtn]);
          const i = sira.indexOf(doc.activeElement);
          e.preventDefault();
          const j = i === -1 ? 0 : (i + (e.shiftKey ? -1 : 1) + sira.length) % sira.length;
          sira[j].focus();
        }
      }

      iptalBtn.addEventListener('click', () => bitir(false));
      onayBtn.addEventListener('click', onayla_);
      secenekler.forEach(x => x.dugme.addEventListener('click', () => bitir(x.x.deger)));
      perde.addEventListener('mousedown', e => { if (e.target === perde) bitir(false); });
      doc.addEventListener('keydown', tus, true);

      doc.body.appendChild(perde);
      (alanlar.length ? alanlar[0].girdi : (o.tehlikeli || secenekler.length ? iptalBtn : onayBtn)).focus();
    });
  }

  /** Ekran verisi yüklenemedi: verinin yerine konan tek tip hata kutusu. */
  function hataKutusu(metin, secenek) {
    const o = secenek || {};
    return el('div', { class: 'hata-kutu', role: 'alert' }, [
      el('strong', { class: 'hata-kutu-baslik', text: o.baslik || 'Yüklenemedi' }),
      el('span', { class: 'hata-kutu-metin', text: String(metin === undefined || metin === null ? '' : metin) }),
      typeof o.yeniden === 'function'
        ? el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: o.yeniden }, [el('span', { text: 'Yeniden dene' })])
        : null
    ]);
  }

  /**
   * 69.6 YEREL PIN penceresi (lib/yerelPin.js; js/core/api.js tehlikeli işlemde 403 `pin-gerekli` alınca çağırır).
   * PIN tanımlı değilse yalnız nasıl belirleneceğini söyler (panelden belirlenemez). Doğru PIN → 10 dk oturum → true.
   * @param veri sunucunun pin-gerekli cevabı ya da /api/yerel-pin/durum
   */
  let pinAcik = null;   // aynı anda iki istek PIN isterse tek pencere
  function pinIste(veri) {
    if (pinAcik) return pinAcik;
    pinAcik = (async () => {
      const d = veri || {};
      if (d.tanimli === false) {
        await onayla({ baslik: 'PIN gerekli', metin: 'Bu işlem PIN ister ama PIN tanımlı değil. Sunucu bilgisayarında bir kez komut satırında "npm run acil-pin" ile 6–12 haneli bir PIN belirleyin (telefondaki acil durdurma PIN\'iyle aynıdır). Sonra işlemi yeniden deneyin.', onay: 'Tamam', iptal: 'Kapat' });
        return false;
      }
      for (let deneme = 0; deneme < 3; deneme++) {
        const g = await onayla({
          baslik: 'PIN gerekli',
          metin: `Bu işlem korumalı: acil PIN'inizi girin. Doğru PIN ${d.sureDk || 10} dakika geçerli olur.${Number.isFinite(d.kalanHak) && d.kalanHak < 5 ? ` Kalan hak: ${d.kalanHak}.` : ''}`,
          onay: 'Doğrula',
          alanlar: [{ ad: 'pin', etiket: 'PIN (6–12 hane)', tip: 'password', inputmode: 'numeric', dogrula: (v) => /^\d{6,12}$/.test(v.trim()) }]
        });
        if (!g || !g.pin) return false;
        let r;
        try { r = await AG.api.yerelPin.dogrula(g.pin.trim()); } catch (e) { bildir(`PIN doğrulanamadı: ${e.message}`, 'hata'); return false; }
        if (r && r.success) { bildir('PIN doğru — 10 dakika boyunca korumalı işlemler PIN sormaz.', 'ok'); return true; }
        bildir((r && r.error) || 'PIN yanlış.', 'hata');
        if (r && (r.kilitli || r[AG.api.DURUM] === 429)) return false;
        if (r && Number.isFinite(r.kalanHak)) d.kalanHak = r.kalanHak;
      }
      return false;
    })();
    pinAcik.finally(() => { pinAcik = null; });
    return pinAcik;
  }
  if (AG.api && typeof AG.api.pinIsteyiciAyarla === 'function') AG.api.pinIsteyiciAyarla(pinIste);

  AG.bildir = bildir;
  AG.onayla = onayla;
  AG.bildirim = { bildir, onayla, turTahmin, hataKutusu, pinIste };

  if (typeof module !== 'undefined' && module.exports) module.exports = AG.bildirim;
})(typeof window !== 'undefined' ? window : globalThis);
