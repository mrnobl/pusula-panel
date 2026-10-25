/**
 * BOTLAR › SERMAYE DAĞITIMI — A4 (TASARIM-MAKINE-HESAP-BOT §8.2; PLAN-MAKINE-HESAP-BOT §8 s2) `AG.pages.sermaye`, rota #/sermaye
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/sermaye/dagitim: hedef paylar, sapma + öneri, kapı (prova / canlı hesap), taraflar, bugünkü tavan, son aktarımlar.
 * Yazma (yalnız bu bilgisayardan): payları kaydet (acil PIN), aktarım İKİ AŞAMALI — önizleme → acil PIN + "AKTAR" → aktar; belirsiz
 * aktarımda "Borsadan sorgula" (tekrar yok). Otomatik aktarım YOK; öneri yalnız formu doldurur. Canlı hesap kapısı panelden açılamaz.
 * DOM AG.dom ile (HTML dizgesi yok); PIN hiçbir yerde saklanmaz.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const bildir = (m, t) => { try { AG.bildirim.bildir(m, t); } catch (e) { /* test */ } };

  let veri = null;
  let form = { kip: 'prova', kaynak: '', hedef: '', tutar: '' };
  let onz = null, onzMesaj = null, mesgul = false;

  /* ── Saf yardımcılar (öz test: scripts/sermaye-aktarim-selftest.js) ── */
  const usdt = (x) => (x == null || !Number.isFinite(+x) ? '—' : `${(+x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`);
  const yuzde = (x) => (x == null || !Number.isFinite(+x) ? '—' : `%${(Math.round(+x * 1000) / 10).toLocaleString('tr-TR')}`);
  /** Saf: aktarım durumu → { metin, ton }. */
  function durumRozet(d) {
    return ({ TAMAM: { metin: 'tamamlandı', ton: 'pos' }, RED: { metin: 'yapılmadı', ton: 'neg' }, BELIRSIZ: { metin: 'belirsiz', ton: 'warn' }, BEKLIYOR: { metin: 'bekliyor', ton: 'warn' } })[d] || { metin: String(d || '—'), ton: '' };
  }
  /** Saf: kip metni. */
  const kipAd = (k) => (k === 'canli' ? 'canlı hesap' : 'prova');
  /** Saf: % girdisi → pay (0–1) | null. */
  function payOku(s) {
    const t = String(s == null ? '' : s).trim().replace(',', '.').replace('%', '');
    if (t === '') return 0;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 10000 : null;
  }
  /** Saf: öneri → form (kaynak/hedef/tutar; kip değişmez). */
  const oneridenForm = (o, f) => ({ ...f, kaynak: o.kaynak, hedef: o.hedef, tutar: String(o.tutar) });
  const zaman = (ms) => { const d = new Date(ms); if (!ms || !Number.isFinite(d.getTime())) return '—'; const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const rozet = (metin, ton) => el('span', { class: `p-rozet${ton ? ' p-rozet-' + ton : ''}`, text: metin });
  const tablo = (id, basliklar, satirlar) => AG.tablo.kutulu({ id, sinif: 'p-tablo', basliklar, satirlar }, 'p-tablo-kap');

  async function pinSor(baslik, metin) {
    const g = await AG.onayla({ baslik, metin, onay: 'Onayla', alanlar: [{ ad: 'pin', etiket: 'Acil PIN', tip: 'password', inputmode: 'numeric', dogrula: (v) => /^\d{6,12}$/.test(v.trim()) }] });
    return g && g.pin ? g.pin.trim() : null;
  }

  /* ── Kartlar ── */
  function kapiKarti(v) {
    const k = v.kapi || { eksikler: [] };
    return el('section', { class: 'p-kart mb-4', id: 'sermayeKapi' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Aktarım kipi' }), rozet(v.kip === 'canli' ? 'canlı hesap aktarımı açık' : 'yalnız prova', v.kip === 'canli' ? 'warn' : 'info')]),
      el('p', { class: 'hint', text: 'Pusula dışarıya para çekmez. Aktarım yalnız aynı borsa hesabının kendi ana / alt hesapları arasında, sizin tek tek başlattığınız ve PIN + "AKTAR" ile onayladığınız işlemlerdir. Otomatik aktarım yok.' }),
      v.kip === 'canli' ? null : el('p', { class: 'hint', text: 'Prova: aktarım sahte borsada denenir — para hareketi yok, botlara ve borsaya dokunulmaz. Canlı hesap aktarımı kapısı kapalı; açılması ayrı ve yazılı karar (canlı hesap kapısıyla birlikte, en erken 2027-01-05).' }),
      (k.eksikler || []).length ? el('ul', { class: 'tb-liste', id: 'sermayeKapiEksik' }, k.eksikler.map(e => el('li', { class: 'tb-eksik' }, [rozet('kapalı', 'neg'), el('span', { text: ` ${e.metin}` })]))) : null,
      el('p', { class: 'hint hint-sm', text: v.aktarimHesabi && v.aktarimHesabi.var
        ? `Aktarım anahtarı: ${v.aktarimHesabi.ad} (${v.aktarimHesabi.borsa})${v.aktarimHesabi.sonSinama ? ` — son sınama ${v.aktarimHesabi.sonSinama.ok ? 'başarılı' : 'başarısız'}${v.aktarimHesabi.sonSinama.cekmeIzni ? ' · PARA ÇEKME İZNİ AÇIK — borsada kapatın' : ''}` : ' — henüz sınanmadı'}`
        : 'Aktarım anahtarı yok (Ayarlar › Anahtarlar › yeni hesap, tür "Aktarım"; para çekme izni KAPALI). Prova için gerekmez.' }),
    ]);
  }

  function paylarKarti(v) {
    const sp = v.sapma || { satirlar: [] };
    const a = v.ayar || {};
    const satirlar = (sp.satirlar || []).map(s => el('tr', null, [
      el('td', { text: (AG.botAd && AG.botAd.ad(s.kimlik)) || s.ad }),
      el('td', { text: usdt(s.ozsermaye) }),
      el('td', null, [el('input', { type: 'text', class: 'form-control', id: `inpSermayePay-${s.kimlik}`, inputmode: 'decimal', autocomplete: 'off', value: s.pay ? String(Math.round(s.pay * 1000) / 10) : '', 'aria-label': `${s.ad} hedef pay (%)` })]),
      el('td', { text: usdt(s.hedef) }),
      el('td', { class: s.fark > 0 ? 'pos' : s.fark < 0 ? 'neg' : '', text: s.fark == null ? '—' : `${s.fark > 0 ? '+' : ''}${usdt(s.fark)}` }),
      el('td', null, [s.bantDisi ? rozet('bant dışı', 'warn') : s.pay ? rozet('bantta', 'pos') : rozet('pay yok', ''), s.aktarilabilir ? null : el('span', { class: 'hint hint-sm', text: ` ${s.neden || ''}` })]),
    ]));
    const canli = v.canliHesaplar || [];
    return el('section', { class: 'p-kart mb-4', id: 'sermayePaylar' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Hedef paylar ve sapma' }), rozet(`toplam ${usdt(sp.toplam)}`, '')]),
      el('p', { class: 'hint', text: 'Her bota sermayenin yüzde kaçının düşeceğini yazın. Sapma bandını aşan bot için en az sayıda aktarım önerilir; öneri yalnız formu doldurur — aktarımı siz onaylarsınız.' }),
      satirlar.length ? tablo('tblSermayePay', ['Bot', 'Özsermaye (son ölçüm)', 'Hedef pay (%)', 'Hedef', 'Fark', 'Durum'], satirlar) : el('p', { class: 'hint', text: 'Bot yok.' }),
      el('div', { class: 'sorun-arac-form mt-3' }, [
        el('label', { for: 'inpSermayeBant', text: 'Sapma bandı (%)' }), el('input', { type: 'text', id: 'inpSermayeBant', class: 'form-control', inputmode: 'decimal', value: String(Math.round((a.bant || 0.05) * 1000) / 10) }),
        el('label', { for: 'inpSermayeTek', text: 'Tek aktarım tavanı (USDT)' }), el('input', { type: 'text', id: 'inpSermayeTek', class: 'form-control', inputmode: 'decimal', value: String(a.tekTavan || '') }),
        el('label', { for: 'inpSermayeGun', text: 'Günlük tavan (USDT)' }), el('input', { type: 'text', id: 'inpSermayeGun', class: 'form-control', inputmode: 'decimal', value: String(a.gunlukTavan || '') }),
        el('label', { for: 'selSermayeAna', text: 'Ana hesabın işlem hesabı (isteğe bağlı)' }),
        el('select', { id: 'selSermayeAna', class: 'form-control' }, [el('option', { value: '', text: '— yok (botlar alt hesaplarda) —' }), ...canli.map(id => el('option', { value: id, text: id, selected: a.anaHesap === id ? '' : null }))]),
      ]),
      el('div', { class: 'sorun-dugmeler mt-3' }, [el('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'btnSermayePayKaydet', onclick: (e) => paylariKaydet(e.currentTarget) }, [el('span', { text: 'Payları kaydet' })])]),
      sp.not ? el('p', { class: 'hint hint-sm mt-3', text: sp.not }) : null,
    ]);
  }

  function onerilerKarti(v) {
    const l = (v.sapma && v.sapma.oneriler) || [];
    if (!l.length) return null;
    const ad = (k) => (k === 'ana' ? 'Ana hesap' : (AG.botAd && AG.botAd.ad(k)) || k);
    return el('section', { class: 'p-kart mb-4', id: 'sermayeOneriler' }, [
      el('h3', { class: 'p-kart-baslik', text: 'Öneriler' }),
      el('ul', null, l.map((o, i) => el('li', null, [el('span', { text: `${ad(o.kaynak)} → ${ad(o.hedef)}: ${usdt(o.tutar)} ` }),
        el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: `btnSermayeOneri-${i}`, onclick: () => { form = oneridenForm(o, form); onz = null; ciz(); } }, [el('span', { text: 'Forma al' })])]))),
    ]);
  }

  function aktarimKarti(v) {
    const t = (v.taraflar && v.taraflar[form.kip]) || [];
    const secim = (id, deger, onDegis) => el('select', { id, class: 'form-control', onchange: (e) => { onDegis(e.currentTarget.value); onz = null; ciz(); } },
      [el('option', { value: '', text: '— seçin —' }), ...t.map(x => el('option', { value: x.kimlik, disabled: x.uygun ? null : '', selected: x.kimlik === deger ? '' : null,
        text: `${x.kimlik === 'ana' ? x.ad : ((AG.botAd && AG.botAd.ad(x.kimlik)) || x.ad)}${x.ozsermaye != null ? ` — ${usdt(x.ozsermaye)}` : ''}${x.uygun ? '' : ` (uygun değil: ${x.neden})`}` }))]);
    const parca = [
      el('h3', { class: 'p-kart-baslik', text: 'Aktarım (iki aşama: önizleme → PIN + AKTAR)' }),
      el('div', { class: 'sorun-arac-form' }, [
        el('label', { for: 'selSermayeKip', text: 'Kip' }),
        el('select', { id: 'selSermayeKip', class: 'form-control', onchange: (e) => { form = { ...form, kip: e.currentTarget.value, kaynak: '', hedef: '' }; onz = null; ciz(); } }, [
          el('option', { value: 'prova', text: 'Prova (sahte borsa — para hareketi yok)', selected: form.kip === 'prova' ? '' : null }),
          el('option', { value: 'canli', text: 'Canlı hesap', disabled: v.kip === 'canli' ? null : '', selected: form.kip === 'canli' ? '' : null })]),
        el('label', { for: 'selSermayeKaynak', text: 'Kaynak' }), secim('selSermayeKaynak', form.kaynak, (x) => { form.kaynak = x; }),
        el('label', { for: 'selSermayeHedef', text: 'Hedef' }), secim('selSermayeHedef', form.hedef, (x) => { form.hedef = x; }),
        el('label', { for: 'inpSermayeTutar', text: `Tutar (USDT; en az ${v.enAz || 5}, en çok ${usdt((v.ayar || {}).tekTavan)})` }),
        el('input', { type: 'text', id: 'inpSermayeTutar', class: 'form-control', inputmode: 'decimal', autocomplete: 'off', value: form.tutar, oninput: (e) => { form.tutar = e.currentTarget.value; onz = null; } }),
      ]),
      el('p', { class: 'hint hint-sm', text: `Bugün kullanılan: prova ${usdt((v.bugun || {}).prova)} · canlı hesap ${usdt((v.bugun || {}).canli)} / günlük tavan ${usdt((v.bugun || {}).tavan)}` }),
      el('div', { class: 'sorun-dugmeler' }, [el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnSermayeOnizle', onclick: (e) => onizle(e.currentTarget) }, [el('span', { text: 'Önizle' })])]),
    ];
    if (onzMesaj) parca.push(el('p', { class: 'tone-danger', role: 'alert', text: onzMesaj }));
    if (onz) {
      parca.push(el('div', { class: 'sorun-arac mt-3', id: 'sermayeOnizleme' }, [
        el('h4', { class: 'sorun-arac-baslik', text: `Önizleme — ${onz.baslik}` }),
        onz.satirlar && onz.satirlar.length ? el('ul', { class: 'sorun-arac-satir' }, onz.satirlar.map(s => el('li', { text: s }))) : null,
        ...(onz.uyarilar || []).map(u => el('p', { class: 'sorun-dokunma' }, [el('strong', { text: 'Dikkat: ' }), el('span', { text: u })])),
        onz.uygulanabilir ? el('div', { class: 'sorun-arac-form' }, [
          el('label', { for: 'inpSermayePin', text: 'Acil PIN' }), el('input', { type: 'password', id: 'inpSermayePin', class: 'form-control', inputmode: 'numeric', autocomplete: 'off', maxlength: '12' }),
          el('label', { for: 'inpSermayeOnay', text: `Onay için ${onz.onayMetni || 'AKTAR'} yazın` }), el('input', { type: 'text', id: 'inpSermayeOnay', class: 'form-control', autocomplete: 'off', spellcheck: 'false', placeholder: onz.onayMetni || 'AKTAR' }),
        ]) : el('p', { class: 'tone-warning' }, [el('strong', { text: 'Yapılamaz: ' }), el('span', { text: onz.neden || '' })]),
        onz.uygulanabilir ? el('div', { class: 'sorun-dugmeler' }, [el('button', { type: 'button', class: `btn ${onz.kip === 'canli' ? 'btn-danger' : 'btn-primary'} btn-sm`, id: 'btnSermayeAktar', onclick: (e) => aktar(e.currentTarget) }, [el('span', { text: onz.kip === 'canli' ? 'Aktar (canlı hesap)' : 'Provayı çalıştır' })])]) : null,
      ]));
    }
    return el('section', { class: 'p-kart mb-4', id: 'sermayeAktarim' }, parca);
  }

  function gecmisKarti(v) {
    const l = v.aktarimlar || [];
    const ad = (k, a) => (k === 'ana' ? a : (AG.botAd && AG.botAd.ad(k)) || a || k);
    return el('section', { class: 'p-kart mb-4', id: 'sermayeGecmis' }, [
      el('h3', { class: 'p-kart-baslik', text: 'Son aktarımlar' }),
      l.length ? tablo('tblSermayeAktarim', ['Zaman', 'Kip', 'Kaynak → hedef', 'Tutar', 'Durum', 'Botlar'], l.map(x => {
        const r = durumRozet(x.durum);
        return el('tr', null, [el('td', { text: zaman(x.z) }), el('td', { text: kipAd(x.kip) }), el('td', { text: `${ad(x.kaynak, x.kaynakAd)} → ${ad(x.hedef, x.hedefAd)}` }), el('td', { text: usdt(x.tutar) }),
          el('td', null, [rozet(r.metin, r.ton), x.hata ? el('span', { class: 'hint hint-sm', text: ` ${x.hata}` }) : null,
            x.durum === 'BELIRSIZ' || x.durum === 'BEKLIYOR' ? el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: `btnSermayeSorgula-${x.id}`, onclick: (e) => sorgula(x.id, e.currentTarget) }, [el('span', { text: 'Borsadan sorgula' })]) : null]),
          el('td', { class: 'hint hint-sm', text: x.kip === 'prova' ? 'prova — dokunulmadı' : x.onKayit ? Object.values(x.onKayit).join(' · ') : '—' })]);
      })) : el('p', { class: 'hint', text: 'Henüz aktarım yok.' }),
    ]);
  }

  function ciz() {
    const k = bul('sermayeKok');
    if (!k || !veri) return;
    doldur(k, [veri.arastirma ? el('p', { class: 'p-bant p-bant-uyari', text: 'Bu bilgisayar araştırma kopyası — sermaye dağıtımı ve aktarım sunucudaki panelden yapılır.' }) : null,
      kapiKarti(veri), paylarKarti(veri), onerilerKarti(veri), aktarimKarti(veri), gecmisKarti(veri)]);
  }

  /* ── İşlemler ── */
  async function paylariKaydet(dugme) {
    if (mesgul || !veri) return;
    const hedefler = {};
    for (const s of (veri.sapma && veri.sapma.satirlar) || []) {
      const p = payOku((bul(`inpSermayePay-${s.kimlik}`) || {}).value);
      if (p == null) { bildir(`${s.ad}: pay 0–100 arasında bir yüzde olmalı`, 'hata'); return; }
      if (p > 0) hedefler[s.kimlik] = p;
    }
    const bant = payOku((bul('inpSermayeBant') || {}).value);
    const g = { hedefler, bant: bant || undefined, tekTavan: (bul('inpSermayeTek') || {}).value, gunlukTavan: (bul('inpSermayeGun') || {}).value, anaHesap: (bul('selSermayeAna') || {}).value || null, onay: true };
    const pin = await pinSor('Hedef payları kaydet', 'Hedef paylar ve tavanlar değişecek. Aktarım YAPILMAZ — yalnız öneriler yeniden hesaplanır.');
    if (!pin) return;
    mesgul = true; AG.dom.mesgul(dugme, '…');
    let r;
    try { r = await AG.api.sermaye.ayar({ ...g, pin }); } catch (e) { r = { success: false, error: e.message }; }
    mesgul = false; AG.dom.hazir(dugme);
    if (!r || !r.success) { bildir((r && r.error) || 'kaydedilemedi', 'hata'); return; }
    bildir('Hedef paylar kaydedildi.', 'ok');
    veri = { ...veri, ...r };
    ciz();
  }

  async function onizle(dugme) {
    if (mesgul) return;
    mesgul = true; AG.dom.mesgul(dugme, '…');
    let r;
    try { r = await AG.api.sermaye.onizle({ kip: form.kip, kaynak: form.kaynak, hedef: form.hedef, tutar: form.tutar }); } catch (e) { r = { success: false, error: e.message }; }
    mesgul = false; AG.dom.hazir(dugme);
    if (!r || !r.success || !r.onizleme) { onz = null; onzMesaj = (r && r.error) || 'önizleme alınamadı'; ciz(); return; }
    onz = r.onizleme; onzMesaj = null;
    ciz();
  }

  async function aktar(dugme) {
    if (mesgul || !onz) return;
    const pin = (bul('inpSermayePin') || {}).value, onay = (bul('inpSermayeOnay') || {}).value;
    mesgul = true; AG.dom.mesgul(dugme, 'Aktarılıyor…');
    let r;
    try { r = await AG.api.sermaye.aktar({ kip: form.kip, kaynak: form.kaynak, hedef: form.hedef, tutar: form.tutar, parmak: onz.parmak, pin: String(pin || '').trim(), onay: String(onay || '').trim() }); } catch (e) { r = { success: false, error: e.message }; }
    mesgul = false; AG.dom.hazir(dugme);
    if (r && r.onizleme) { onz = r.onizleme; onzMesaj = r.error || null; ciz(); return; }   // 409: durum değişti → yeni önizleme (PIN yeniden)
    if (!r || (!r.success && r.durum !== 'BELIRSIZ')) { onzMesaj = (r && r.error) || 'aktarım yapılamadı'; ciz(); return; }
    bildir(r.durum === 'TAMAM' ? `Aktarım: ${r.ozet || 'tamam'}` : 'Aktarımın sonucu belirsiz — tekrarlanmadı; "Borsadan sorgula".', r.durum === 'TAMAM' ? 'ok' : 'uyari');
    onz = null; onzMesaj = null; form = { ...form, tutar: '' };
    await yukle();
  }

  async function sorgula(id, dugme) {
    if (mesgul) return;
    mesgul = true; AG.dom.mesgul(dugme, '…');
    let r;
    try { r = await AG.api.sermaye.sorgula(id); } catch (e) { r = { success: false, error: e.message }; }
    mesgul = false; AG.dom.hazir(dugme);
    if (!r || !r.success) bildir((r && r.error) || 'sorgulanamadı', 'hata');
    else bildir(`Aktarım #${id}: ${durumRozet(r.durum).metin}`, r.durum === 'TAMAM' ? 'ok' : 'uyari');
    await yukle();
  }

  async function yukle() {
    const k = bul('sermayeKok');
    if (!k) return;
    let r;
    try { r = await AG.api.sermaye.durum(); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Sermaye dağıtımı okunamadı', yeniden: yukle })]); return; }
    veri = r;
    if (form.kip === 'canli' && r.kip !== 'canli') form = { ...form, kip: 'prova' };
    ciz();
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-sermaye') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.sermaye = { yukle, durumRozet, kipAd, payOku, oneridenForm, usdt, yuzde, _durum: { veriAyarla: (v) => { veri = v; }, form: () => form }, _ciz: { ciz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.sermaye;
})(typeof window !== 'undefined' ? window : globalThis);
