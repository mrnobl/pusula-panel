/**
 * SİSTEM › BİLDİRİMLER — bildirim merkezi, PLAN-PANEL-2 §0.3 (kullanıcı kararı 2026-10-19; 73.5 D8 düzenleme) `AG.pages.bildirimMerkezi`
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/bildirim (lib/bildirimMerkezi.js): katalog (grup · ad · ne zaman gelir · önem · son gönderim · açık/kapalı · 73.5 kanal,
 * sessiz saat davranışı, metin şablonu + önizleme + değişkenler), sessiz saat, yeni türlerin ayarları, son gönderilenler, Telegram
 * durumu. Yazma: POST /api/bildirim/{ayar,tur,sessiz,uretici}; canlı önizleme POST /api/bildirim/onizle (yan etkisiz).
 * KRİTİK türler (acil, koruma stopu, ENGEL/güvenli kip/emir freni, güvenlik) kapatılamaz, sessiz saati deler; yalnız metni değişir.
 * Telefonda salt okunur: metin düzenleme kapalı, önizleme kayıtlı metinden (sunucu da POST'u 403 ile reddeder).
 * Önizleme Telegram HTML'inden yalnız <b> <i> <u> <s> <code> öğe olarak kurulur — innerHTML yok.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  /** 72.0: katalog metni eski bot adıyla gelebilir (sunucu eski sürüm) → yeni ad. */
  const cv = (t) => (AG.botAd ? AG.botAd.cevir(t) : t);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const ONEM_AD = { kritik: 'kritik', uyari: 'uyarı', bilgi: 'bilgi' };
  const ONEM_TON = { kritik: 'neg', uyari: 'warn', bilgi: 'info' };
  const SONUC_AD = { gonderildi: 'gönderildi', kapali: 'kapalı olduğu için gönderilmedi', hata: 'gönderilemedi', bekletildi: 'sessiz saat — özete bekletildi', dusuruldu: 'sessiz saat — düşürüldü' };
  const KANAL_AD = { telegram: 'Telegram', ntfy: 'ntfy', ikisi: 'Telegram + ntfy' };
  const SESSIZ_AD = { ozet: 'bekletilsin, sonra özet', dusur: 'gönderilmesin', gonder: 'yine de gönderilsin' };
  let veri = null;
  const acikTur = new Set();          // ayrıntısı açık türler (yeniden çizimde korunur)
  const taslak = {};                  // tür → düzenlenen metin (kaydedilmemiş)
  let onizleZaman = null;

  /** 2026-10-19T03:04:00Z → "bugün 06:04" / "dün 06:04" / "17.10 06:04"; yoksa "hiç". */
  function ne(iso, simdi = new Date()) {
    if (!iso) return 'hiç';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    const p = (n) => String(n).padStart(2, '0');
    const saat = `${p(d.getHours())}:${p(d.getMinutes())}`;
    const gun = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    const dun = new Date(simdi.getTime() - 864e5);
    if (gun(d) === gun(simdi)) return `bugün ${saat}`;
    if (gun(d) === gun(dun)) return `dün ${saat}`;
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${saat}`;
  }

  /** Saf: katalog → gruplar (sıra korunur). */
  function gruplar(katalog) {
    const m = new Map();
    for (const k of katalog || []) { if (!m.has(k.grup)) m.set(k.grup, []); m.get(k.grup).push(k); }
    return [...m.entries()].map(([ad, turler]) => ({ ad, turler }));
  }

  /** Saf: Telegram HTML → satır satır [{ etiket, kalin, metin }] (izinsiz etiket düz metin, varlıklar çözülür). */
  function htmlParcala(html) {
    const coz = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    return String(html || '').split('\n').map(satir => {
      const out = [];
      const yigin = [];
      for (const p of satir.split(/(<\/?(?:b|i|u|s|code)>)/i)) {
        if (!p) continue;
        const m = /^<(\/)?(b|i|u|s|code)>$/i.exec(p);
        if (m) { if (m[1]) yigin.pop(); else yigin.push(m[2].toLowerCase()); continue; }
        out.push({ etiket: yigin.length ? yigin[yigin.length - 1] : null, kalin: yigin.includes('b'), metin: coz(p.replace(/<[^>]+>/g, '')) });
      }
      return out;
    });
  }
  /** Telegram mesajı gibi görünen önizleme kutusu (öğelerle, innerHTML yok). */
  function onizlemeKutusu(html, id) {
    return el('div', { class: 'bm-onizleme', id, 'aria-live': 'polite' }, htmlParcala(html).map(satir => el('div', { class: 'bm-onizleme-satir' },
      satir.length ? satir.map(p => el(p.etiket === 'code' ? 'code' : p.etiket === 'i' ? 'em' : p.kalin || p.etiket === 'b' ? 'strong' : 'span', { text: p.metin })) : [el('span', { text: ' ' })])));
  }

  const telefon = () => !!((AG.pages && AG.pages.kabuk && AG.pages.kabuk.telefon && AG.pages.kabuk.telefon()) || (AG.api && AG.api.kademe && AG.api.kademe() === 'telefon'));
  const yeniSunucu = () => !!(veri && veri.surum === 2);

  async function cagir(fn, basari) {
    try {
      const r = await fn();
      if (!r || !r.success) { AG.bildir(`Kaydedilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 }); return null; }
      if (basari) AG.bildir(basari, 'ok');
      for (const u of r.uyarilar || []) AG.bildir(u, 'uyari', { sure: 10000 });
      return r;
    } catch (e) { AG.bildir(`Kaydedilemedi: ${e.message}`, 'hata'); return null; }
  }

  async function degistir(tur, acik, kutu) {
    if (kutu) kutu.disabled = true;
    await cagir(() => AG.api.bildirim.ayarla(tur, acik));
    await yukle();
  }
  async function turKaydet(tur, alanlar, mesaj) {
    const r = await cagir(() => AG.api.bildirim.tur({ tur, ...alanlar }), mesaj);
    if (r && 'metin' in alanlar) delete taslak[tur];
    await yukle();
  }

  async function deneme(dugme) {
    AG.dom.mesgul(dugme, 'Gönderiliyor…');
    try {
      const r = await AG.api.telegramTest();
      if (r && r.success) AG.bildir('Deneme mesajı gönderildi — Telegram\'a bakın.', 'ok');
      else AG.bildir(`Gönderilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 });
    } catch (e) { AG.bildir(`Gönderilemedi: ${e.message}`, 'hata'); } finally { AG.dom.hazir(dugme); await yukle(); }
  }

  /** Canlı önizleme (300 ms bekleyerek). */
  function onizleIste(t, metin) {
    if (onizleZaman) clearTimeout(onizleZaman);
    onizleZaman = setTimeout(async () => {
      const kutu = bul(`bmOnizleme-${t.id}`), uyari = bul(`bmOnizlemeUyari-${t.id}`);
      if (!kutu) return;
      let r;
      try { r = await AG.api.bildirim.onizle(t.id, metin); } catch (e) { r = { success: false, error: e.message }; }
      if (!r || !r.success) { if (uyari) uyari.textContent = `Önizleme alınamadı: ${(r && r.error) || 'bilinmeyen hata'}`; return; }
      const yeni = onizlemeKutusu(r.metin, `bmOnizleme-${t.id}`);
      if (kutu.parentNode) kutu.parentNode.replaceChild(yeni, kutu);
      if (uyari) {
        uyari.textContent = r.ok ? (r.varsayilan ? 'Varsayılan metin (bugünkü biçim).' : '')
          : `${r.hata}${r.bilinmeyen && r.bilinmeyen.length ? ' — gönderimde bu tür varsayılan metinle gider.' : ''}`;
        uyari.className = `hint mb-0 ${r.ok ? '' : 'tone-danger'}`.trim();
      }
    }, 300);
  }

  function degiskenCipi(t, d, alan) {
    return el('button', { type: 'button', class: 'bm-cip', title: d.aciklama, disabled: telefon() ? '' : null,
      onclick: () => {
        const a = alan();
        if (!a || a.readOnly) return;
        const s = a.selectionStart != null ? a.selectionStart : a.value.length, e2 = a.selectionEnd != null ? a.selectionEnd : s;
        a.value = `${a.value.slice(0, s)}{${d.ad}}${a.value.slice(e2)}`;
        taslak[t.id] = a.value;
        if (a.focus) a.focus();
        onizleIste(t, a.value);
      } }, [el('span', { text: `{${d.ad}}` })]);
  }

  /** Bir türün açılır ayrıntısı: kanal, sessiz saat, metin + değişkenler + önizleme. */
  function ayrinti(t) {
    const salt = telefon();
    const ntfyVar = !!(veri.ntfy && veri.ntfy.ayarli);
    const kanalSec = el('select', { id: `bmKanal-${t.id}`, class: 'form-control bm-sec', disabled: salt ? '' : null, 'aria-label': 'Kanal',
      onchange: (e) => turKaydet(t.id, { kanal: e.target.value }, 'Kanal kaydedildi.') },
    (t.kritik ? ['telegram', 'ikisi'] : ['telegram', 'ntfy', 'ikisi']).map(k => { const o = el('option', { value: k, text: KANAL_AD[k] }); if (k === t.kanal) o.selected = true; return o; }));
    const sessizSec = t.kritik ? null : el('select', { id: `bmSessiz-${t.id}`, class: 'form-control bm-sec', disabled: salt ? '' : null, 'aria-label': 'Sessiz saatte',
      onchange: (e) => turKaydet(t.id, { sessiz: e.target.value }, 'Kaydedildi.') },
    ['ozet', 'dusur', 'gonder'].map(k => { const o = el('option', { value: k, text: SESSIZ_AD[k] }); if (k === t.sessiz) o.selected = true; return o; }));
    const deger = Object.hasOwn(taslak, t.id) ? taslak[t.id] : (t.metin || '');
    const alan = el('textarea', { id: `bmMetin-${t.id}`, class: 'form-control bm-metin', rows: '5', spellcheck: 'false', 'aria-label': `${cv(t.ad)} metni`,
      placeholder: `Boş = bugünkü metin. Başlangıç için:\n${veri.varsayilanSablon || '{simge} <b>{baslik}</b>\n{govde}'}`,
      readonly: salt ? '' : null, oninput: (e) => { taslak[t.id] = e.target.value; onizleIste(t, e.target.value); } });
    alan.value = deger;
    return el('div', { class: 'bm-ayrinti', id: `bmAyrinti-${t.id}` }, [
      el('div', { class: 'bm-ayrinti-ust' }, [
        el('label', { class: 'bm-alan', for: `bmKanal-${t.id}` }, [el('span', { class: 'df-soluk', text: 'Kanal' }), kanalSec]),
        sessizSec ? el('label', { class: 'bm-alan', for: `bmSessiz-${t.id}` }, [el('span', { class: 'df-soluk', text: 'Sessiz saatte' }), sessizSec])
          : el('span', { class: 'df-soluk bm-alan', text: 'Kritik: sessiz saati deler, Telegram her zaman açık.' }),
        !ntfyVar && t.kanal !== 'telegram' ? el('span', { class: 'hint mb-0 tone-warning', text: 'ntfy kurulu değil — kurulana kadar Telegram\'dan gider.' }) : null,
      ]),
      el('div', { class: 'bm-duzen' }, [
        el('div', { class: 'bm-duzen-sol' }, [
          el('span', { class: 'df-soluk', text: salt ? 'Metin (telefonda yalnız görüntülenir)' : 'Metin — süslü parantezli değişkenler mesajın o anki değeriyle dolar' }),
          alan,
          el('div', { class: 'bm-cipler' }, (t.degiskenler || []).map(d => degiskenCipi(t, d, () => bul(`bmMetin-${t.id}`)))),
          salt ? null : el('div', { class: 'bm-dugmeler' }, [
            el('button', { type: 'button', class: 'btn btn-primary', id: `bmKaydet-${t.id}`, onclick: () => turKaydet(t.id, { metin: (bul(`bmMetin-${t.id}`) || alan).value }, 'Metin kaydedildi.') }, [el('span', { text: 'Metni kaydet' })]),
            el('button', { type: 'button', class: 'btn btn-secondary', id: `bmVarsayilan-${t.id}`, onclick: () => turKaydet(t.id, { metin: '' }, 'Varsayılan metne dönüldü.') }, [el('span', { text: 'Varsayılana dön' })]),
          ]),
        ]),
        el('div', { class: 'bm-duzen-sag' }, [
          el('span', { class: 'df-soluk', text: 'Önizleme (örnek mesajla)' }),
          onizlemeKutusu(t.onizleme || '', `bmOnizleme-${t.id}`),
          el('p', { class: `hint mb-0 ${t.sablonHata ? 'tone-danger' : ''}`.trim(), id: `bmOnizlemeUyari-${t.id}`,
            text: t.sablonHata ? `${t.sablonHata} — gönderimde varsayılan metin kullanılıyor.` : t.metin ? '' : 'Varsayılan metin (bugünkü biçim).' }),
        ]),
      ]),
    ]);
  }

  function satir(t) {
    const salt = telefon();
    const kutu = el('input', { type: 'checkbox', id: `chkBildirim-${t.id}`, class: 'bm-kutu', 'aria-label': `${cv(t.ad)} ${t.acik ? 'açık' : 'kapalı'}`,
      disabled: t.kilitli || salt ? '' : null, onchange: (e) => degistir(t.id, e.target.checked, e.target) });
    kutu.checked = !!t.acik;
    const acik = acikTur.has(t.id);
    const yeni = yeniSunucu();
    const rozetler = yeni ? [
      t.kanal && t.kanal !== 'telegram' ? el('span', { class: 'p-rozet p-rozet-info', text: KANAL_AD[t.kanal] }) : null,
      t.metin ? el('span', { class: 'p-rozet p-rozet-info', text: 'metin düzenlendi' }) : null,
      t.uretici ? el('span', { class: 'p-rozet p-rozet-pos', text: 'yeni' }) : null,
    ].filter(Boolean) : [];
    return el('div', { class: `bm-satir${t.acik ? '' : ' bm-kapali'}`, 'data-tur': t.id }, [
      el('div', { class: 'bm-ad' }, [
        el('strong', { text: cv(t.ad) }),
        el('span', { class: 'df-soluk', text: t.kilitli ? `${cv(t.aciklama)} — kapatılamaz` : cv(t.aciklama) }),
        yeni ? el('span', { class: 'bm-rozetler' }, [
          ...rozetler,
          el('button', { type: 'button', class: 'bm-ac-dugme', id: `bmAc-${t.id}`, 'aria-expanded': acik ? 'true' : 'false', 'aria-controls': `bmAyrinti-${t.id}`,
            onclick: () => { if (acikTur.has(t.id)) acikTur.delete(t.id); else acikTur.add(t.id); ciz(); } }, [el('span', { text: acik ? 'Kapat' : (salt ? 'Ayrıntı' : 'Düzenle') })]),
        ]) : null,
      ]),
      el('span', null, [el('span', { class: `p-rozet p-rozet-${ONEM_TON[t.onem] || 'info'}`, text: ONEM_AD[t.onem] || t.onem })]),
      el('span', { class: 'df-soluk bm-son', text: ne(t.sonGonderim) }),
      el('label', { class: 'bm-ac', for: `chkBildirim-${t.id}` }, [kutu]),
      acik && yeni ? ayrinti(t) : null,
    ]);
  }

  function sessizKart() {
    const s = veri.sessiz || {};
    const salt = telefon();
    const ac = el('input', { type: 'checkbox', id: 'bmSessizAcik', class: 'bm-kutu', disabled: salt ? '' : null });
    ac.checked = !!s.acik;
    const bas = el('input', { type: 'time', id: 'bmSessizBas', class: 'form-control bm-saat', value: s.bas || '23:00', disabled: salt ? '' : null, 'aria-label': 'Başlangıç' });
    const bit = el('input', { type: 'time', id: 'bmSessizBit', class: 'form-control bm-saat', value: s.bit || '08:00', disabled: salt ? '' : null, 'aria-label': 'Bitiş' });
    return el('section', { class: 'p-kart', id: 'bmSessizKart' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Sessiz saatler' }),
        s.acik ? el('span', { class: `p-rozet ${s.simdi ? 'p-rozet-warn' : 'p-rozet-info'}`, text: s.simdi ? 'şu an sessiz' : 'açık' }) : el('span', { class: 'p-rozet p-rozet-info', text: 'kapalı' })]),
      el('p', { class: 'hint mb-3', text: 'Bu saatlerde (İstanbul saati) gelen bildirim, türünün ayarına göre bekletilir ve sessiz saat bitince TEK özet mesajı olarak gelir, ya da hiç gönderilmez. Kritik bildirimler (acil durum, koruma stopu, ENGEL / güvenli kip / emir freni, güvenlik) sessiz saati deler, hemen gelir.' }),
      el('div', { class: 'bm-sessiz' }, [
        el('label', { class: 'bm-alan bm-alan-yatay', for: 'bmSessizAcik' }, [ac, el('span', { text: 'Sessiz saatleri kullan' })]),
        el('label', { class: 'bm-alan', for: 'bmSessizBas' }, [el('span', { class: 'df-soluk', text: 'Başlangıç' }), bas]),
        el('label', { class: 'bm-alan', for: 'bmSessizBit' }, [el('span', { class: 'df-soluk', text: 'Bitiş' }), bit]),
        salt ? null : el('button', { type: 'button', class: 'btn btn-secondary', id: 'bmSessizKaydet',
          onclick: async () => { await cagir(() => AG.api.bildirim.sessiz({ acik: ac.checked, bas: bas.value, bit: bit.value }), 'Sessiz saat kaydedildi.'); await yukle(); } }, [el('span', { text: 'Kaydet' })]),
      ]),
      s.bekleyen ? el('p', { class: 'hint mt-2 mb-0', text: `${s.bekleyen} bildirim özet için bekliyor.` }) : null,
      geciciSatir(s.gecici, salt),
    ]);
  }

  /** 74.1: Telegram menüsündeki "🔕 1 saat sessize al" etkinse durum + "Erken bitir" (77.x: telefonda da — PIN'siz, yalnız susturmayı kaldırır). */
  function geciciSatir(g, salt) {
    if (!g || !g.bitis) return null;
    const saat = (ms) => { const d = new Date(ms); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'; };
    return el('div', { class: 'bm-gecici mt-3', id: 'bmGecici', role: 'status' }, [
      el('span', { class: 'p-rozet p-rozet-warn', text: 'geçici sessiz' }),
      el('span', { text: `Telegram'dan "1 saat sessize al" denmiş${g.zaman ? ` (${saat(g.zaman)})` : ''}: kritik olmayan bildirimler ${saat(g.bitis)}'e kadar bekliyor, sonra tek özet gelir. Kritik bildirimler (acil durum, koruma stopu, ENGEL, güvenlik) susmaz.` }),
      el('button', { type: 'button', class: 'btn btn-secondary', id: 'bmGeciciBitir',
        onclick: async () => { await cagir(() => AG.api.bildirim.geciciBitir(), 'Geçici sessiz bitti — bekleyenler bir dakika içinde tek özet olarak gelir.'); await yukle(); } }, [el('span', { text: 'Erken bitir' })]),
    ]);
  }

  function ureticiKart() {
    const u = veri.uretici || {};
    const f = u.fiyat || {}, m = u.makine || {}, bl = u.bilanco || {}, tk = u.takvim || {};
    const d = veri.ureticiDurum || {};
    const salt = telefon();
    const girdi = (id, deger, etiket, tip = 'number', ek = {}) => el('label', { class: 'bm-alan', for: id }, [el('span', { class: 'df-soluk', text: etiket }),
      el('input', { id, type: tip, class: 'form-control bm-girdi', value: String(deger == null ? '' : deger), disabled: salt ? '' : null, ...ek })]);
    const v = (id) => { const x = bul(id); return x ? x.value : ''; };
    const zm = (ms) => (ms ? ne(new Date(ms).toISOString()) : 'henüz yok');
    const makineler = ((d.makine && d.makine.makineler) || []);
    const bilgi = [
      d.arastirma ? 'Bu bilgisayar araştırma kopyası: yeni türleri sunucu üretir (sunucuya bağlıysa bu ekranda sunucunun ayarı görünür).' : null,
      d.bilanco ? `Bilanço: ${d.bilanco.izlenen == null ? 'tüm BIST' : `${d.bilanco.izlenen} şirket`} izleniyor${d.bilanco.evren100 ? ` (BIST 100 vekili ${d.bilanco.evren100.sayi} şirket${d.bilanco.evren100.veriGunu ? `, veri ${d.bilanco.evren100.veriGunu}` : ''}${d.bilanco.evren100.kaynak === 'bist-yedek' ? ', yedek liste' : ''})` : ''} · son KAP denetimi ${zm(d.bilanco.kontrol)}${d.bilanco.bekleyen ? ` · ${d.bilanco.bekleyen} sonuç özet saatini bekliyor` : ''}${d.bilanco.kuyruk ? ` · ${d.bilanco.kuyruk} bildirim okunacak` : ''}${d.bilanco.sonOzet ? ` · son özet ${zm(d.bilanco.sonOzet.zaman)}` : ''}${d.bilanco.hata ? ` · hata: ${d.bilanco.hata}` : ''}` : null,
      d.takvim ? `Piyasa takvimi: son denetim ${zm(d.takvim.kontrol)}${d.takvim.hafta ? ` · haftalık mesaj ${d.takvim.hafta}` : ''} · ${d.takvim.hatirlatilan || 0} hatırlatma, ${d.takvim.sonuc || 0} sonuç${d.takvim.hata ? ` · hata: ${d.takvim.hata}` : ''}` : null,
      d.yapayZeka ? `Yapay zekâ notları: ${d.yapayZeka.durum === 'anahtar-bekliyor' ? 'Gemini anahtarı bekleniyor (Ayarlar › Anahtarlar)' : d.yapayZeka.sonCalisma ? `son okuma ${zm(d.yapayZeka.sonCalisma.bit)} · ${(d.yapayZeka.sonCalisma.sayim || {}).incele || 0} incele` : 'henüz okuma yok'}` : null,
      d.anahtar ? `Anahtar sınaması: son ${d.anahtar.gun || '—'} · ${d.anahtar.sayi || 0} anahtar · ${d.anahtar.sorun || 0} sorun` : null,
      d.golge && d.golge.hafta ? `Gölge testler özeti: son ${d.golge.hafta}` : null,
      d.fiyat ? `Fiyat denetimi: son ${zm(d.fiyat.kontrol)}${d.fiyat.hata ? ` · hata: ${d.fiyat.hata}` : ''}` : null,
      makineler.length ? `Araştırma kopyaları: ${makineler.map(x => `${x.ad} (son ${zm(x.son)})`).join(', ')}` : (d.makine ? 'Araştırma kopyası henüz sunucuya görünmedi (sunucu bağlantısı kurulu kopya 10 dk\'da bir görünür).' : null),
    ].filter(Boolean);
    return el('section', { class: 'p-kart', id: 'bmUreticiKart' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Yeni bildirimlerin ayarı' })]),
      el('p', { class: 'hint mb-3', text: 'Sert fiyat hareketi: son fiyat, seçilen süre içindeki en düşük / en yüksek kapanıştan eşik kadar uzaklaşınca (aynı sembol ve yön, tekrar süresinde bir kez). Makine sessiz: araştırma kopyası bu kadar saat sunucuya görünmezse; sunucu açılışta bu kadar dakikadan uzun kapalı kaldıysa. Bilanço özeti: günde en çok 2 mesaj (bilanço yoksa mesaj yok); elinizdeki hisseler her zaman 📌 ile yazılır, satır sınırına sayılmaz. Piyasa takvimi: pazartesi bu saatten sonra haftanın olayları tek mesaj; her olaydan bir gün önce bu saatten sonra hatırlatma (İstanbul saati).' }),
      el('div', { class: 'bm-uretici' }, [
        girdi('bmFiyatSembol', (f.semboller || []).join(', '), 'Semboller (Binance, ör. BTCUSDT, ETHUSDT)', 'text', { maxlength: '200' }),
        girdi('bmFiyatEsik', f.esikYuzde, 'Eşik (%)', 'number', { min: '1', max: '50', step: '0.5' }),
        girdi('bmFiyatPencere', f.pencereDk, 'Süre (dk)', 'number', { min: '5', max: '1440', step: '5' }),
        girdi('bmFiyatTekrar', f.tekrarSaat, 'Tekrar (saat)', 'number', { min: '1', max: '72', step: '1' }),
        girdi('bmMakineEsik', m.esikSaat, 'Araştırma kopyası (saat)', 'number', { min: '1', max: '168', step: '1' }),
        girdi('bmSunucuEsik', m.sunucuEsikDk, 'Sunucu kapalı (dk)', 'number', { min: '10', max: '1440', step: '5' }),
        el('label', { class: 'bm-alan', for: 'bmBilancoEvren' }, [el('span', { class: 'df-soluk', text: 'Bilanço: hangi şirketler' }),
          el('select', { id: 'bmBilancoEvren', class: 'form-control bm-girdi', disabled: salt ? '' : null }, [['elde', 'Yalnız elimdekiler'], ['bist100', 'Elimdekiler + BIST 100'], ['tum', 'Tüm BIST']]
            .map(([d2, a]) => { const op = el('option', { value: d2, text: a }); if ((bl.evren || 'bist100') === d2) op.selected = true; return op; }))]),
        girdi('bmBilancoSaat', (bl.saatler || []).join(', '), 'Bilanço mesaj saatleri (en çok 2, ör. 13:00, 20:30)', 'text', { maxlength: '20' }),
        girdi('bmBilancoSatir', bl.satir, 'Bilanço mesajı satır sayısı', 'number', { min: '3', max: '15', step: '1' }),
        girdi('bmTakvimHafta', tk.haftalikSaat || '09:00', 'Piyasa takvimi: pazartesi mesaj saati', 'text', { maxlength: '5' }),
        girdi('bmTakvimOnceki', tk.oncekiSaat || '18:00', 'Piyasa takvimi: bir gün önce hatırlatma saati', 'text', { maxlength: '5' }),
      ]),
      salt ? null : el('div', { class: 'bm-dugmeler mt-3' }, [el('button', { type: 'button', class: 'btn btn-secondary', id: 'bmUreticiKaydet',
        onclick: async () => {
          await cagir(() => AG.api.bildirim.uretici({ fiyat: { semboller: v('bmFiyatSembol'), esikYuzde: v('bmFiyatEsik'), pencereDk: v('bmFiyatPencere'), tekrarSaat: v('bmFiyatTekrar') },
            makine: { esikSaat: v('bmMakineEsik'), sunucuEsikDk: v('bmSunucuEsik') },
            bilanco: { evren: v('bmBilancoEvren'), saatler: v('bmBilancoSaat'), satir: v('bmBilancoSatir') },
            takvim: { haftalikSaat: v('bmTakvimHafta'), oncekiSaat: v('bmTakvimOnceki') } }), 'Kaydedildi.');
          await yukle();
        } }, [el('span', { text: 'Kaydet' })])]),
      bilgi.length ? el('ul', { class: 'bm-bilgi mt-3' }, bilgi.map(b => el('li', { class: 'df-soluk', text: b }))) : null,
    ]);
  }

  function ciz() {
    const k = bul('bildirimKok');
    if (!k || !veri) return;
    const tg = veri.telegram || {};
    const salt = telefon();
    const yeni = yeniSunucu();
    doldur(k, [
      el('div', { class: 'bm-ust mb-4' }, [
        el('span', { class: `p-rozet ${tg.bagli ? 'p-rozet-pos' : 'p-rozet-warn'}`, id: 'bildirimTelegram', text: tg.bagli ? 'Telegram bağlı' : 'Telegram bağlı değil' }),
        !tg.bagli && tg.neden ? el('span', { class: 'df-soluk', text: tg.neden }) : null,
        yeni ? el('span', { class: `p-rozet ${veri.ntfy && veri.ntfy.ayarli ? 'p-rozet-pos' : 'p-rozet-info'}`, id: 'bildirimNtfy', text: veri.ntfy && veri.ntfy.ayarli ? 'ntfy kurulu' : 'ntfy kurulu değil' }) : null,
        el('a', { class: 'no-underline', href: '#/ayarlar/bildirimler', text: 'Bağlantı ayarları →' }),
        el('button', { type: 'button', class: 'btn btn-secondary bm-deneme', id: 'btnBildirimDeneme', disabled: salt ? '' : null, onclick: (e) => deneme(e.currentTarget) }, [el('span', { text: 'Deneme mesajı gönder' })]),
      ]),
      !yeni ? el('p', { class: 'hint mb-4', text: 'Sunucudaki Pusula 73.5 öncesi bir sürüm: yalnız aç/kapat görünüyor. Metin, kanal ve sessiz saat ayarları sunucu güncellenince gelir.' }) : null,
      el('div', { class: 'bm-izgara' }, [
        el('div', { class: 'bm-turler', id: 'bildirimTurler' }, [
          yeni ? sessizKart() : null,
          ...gruplar(veri.katalog).map(g => el('section', { class: 'p-kart' }, [
            el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: g.ad })]),
            el('div', { class: 'bm-satir bm-bas df-soluk' }, [el('span', { text: 'Bildirim · ne zaman gelir' }), el('span', { text: 'Önem' }), el('span', { text: 'Son gönderim' }), el('span', { text: 'Açık' })]),
            ...g.turler.map(satir),
          ])),
          yeni ? ureticiKart() : null,
        ]),
        el('aside', { class: 'p-kart bm-gecmis', id: 'bildirimGecmis' }, [
          el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Son gönderilenler' })]),
          (veri.gecmis || []).length ? el('ul', { class: 'bm-liste' }, veri.gecmis.slice(0, 20).map(g => {
            const t = (veri.katalog || []).find(x => x.id === g.tur);
            const tAd = t ? cv(t.ad) : g.tur === 'sessiz' ? 'Sessiz saat özeti' : g.tur;
            return el('li', { class: `bm-oge${g.sonuc === 'hata' ? ' bm-oge-hata' : g.sonuc === 'kapali' || g.sonuc === 'dusuruldu' ? ' bm-oge-kapali' : ''}` }, [
              el('span', { class: 'df-soluk bm-oge-ust', text: `${ne(g.zaman)} · ${tAd} · ${SONUC_AD[g.sonuc] || g.sonuc}${g.kanal && g.kanal !== 'telegram' ? ` · ${KANAL_AD[g.kanal] || g.kanal}` : ''}` }),
              el('span', { text: g.baslik || '—' }),
              g.hata ? el('span', { class: 'df-soluk', text: g.hata }) : null,
            ]);
          })) : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: tg.bagli ? 'Henüz bildirim gönderilmedi.' : 'Telegram bağlı olmadığı için kayıt yok.' })]),
        ]),
      ]),
      salt ? el('p', { class: 'hint mt-3 mb-0', text: 'Telefonda yalnız görüntülenir; aç/kapat, metin, kanal ve sessiz saat sunucunun bilgisayarından (ya da sunucuya bağlı geliştirme bilgisayarından).' }) : null,
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function yukle() {
    const k = bul('bildirimKok');
    if (!k) return;
    let r;
    try { r = await AG.api.bildirim.liste(); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Bildirimler okunamadı', yeniden: yukle })]); return; }
    veri = r;
    ciz();
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-bildirim') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.bildirimMerkezi = { yukle, gruplar, ne, htmlParcala, _durum: { veriAyarla: (v) => { veri = v; }, ac: (id) => acikTur.add(id) }, _ciz: { ciz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.bildirimMerkezi;
})(typeof window !== 'undefined' ? window : globalThis);
