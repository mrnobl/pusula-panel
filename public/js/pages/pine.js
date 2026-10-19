/**
 * PINE EKRANI — Araştırma › Pine (Pusula P4) `AG.pages.pine`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kullanıcı: "bir script kodu bulduğumda bunu panelde denemek isterim." Akış:
 *   1. betiği yapıştır → 2. DENETLE (desteklenmeyen her yapı satır numarasıyla, kayıt
 *   yapılmaz) → 3. KAYDET (derlenmeyen betik diske yazılmaz) → 4. "Backtest'te dene" /
 *   "Kâğıt testte dene" (strateji seçilir, ilgili ekran açılır).
 *
 * İki adım bilinçli (eski pine.html ile aynı ilke): rapor kararın ÖNÜNDE — kullanıcı neyin
 * çevrilmediğini kaydetmeden görür. Sunucu metni (betik adı, hata) HER ZAMAN metin olarak
 * yazılır (AG.dom.el text) — işaretleme ayrıştırılmaz.
 *
 * Eski ayrı sayfa (pine.html + pine-page.js) bu ekrana taşındı; pine.html yönlendirir.
 */
(function (global) {
  'use strict';
  const AG = global.AG || (global.AG = {});
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);

  let secili = null;        // düzenlenen betiğin anahtarı (yeni ise null)
  let kayitliAnahtar = null; // son kaydedilen (dene düğmeleri bunu kullanır)
  let betikler = [];
  let yuklendi = false;

  const el = (t, p, c) => AG.dom.el(t, p, c);

  /* ── Saf yardımcılar (test edilir) ─────────────────────────────────────── */

  /** Denetim yanıtı → rapor satırları [{ tur: 'bilgi'|'uyari'|'kotu', metin }]. */
  function raporSatirlari(d) {
    if (!d) return [{ tur: 'kotu', metin: 'Denetim yanıtı yok.' }];
    if (d.ayristirmaHatasi) return [{ tur: 'kotu', metin: String(d.ayristirmaHatasi) }];
    const b = d.bilgi || {};
    const out = [{
      tur: 'bilgi',
      metin: `Tür: ${b.tur || '—'} · ad: ${b.ad || '—'} · sürüm: v${b.version || '?'} · ${(b.inputs || []).length} parametre`
    }];
    if (b.tur && b.tur !== 'strategy') out.push({ tur: 'kotu', metin: 'Bu bir gösterge (indicator) — işlem açmaz. Backtest için strategy(...) bildirimi gerekir.' });
    for (const u of b.uyarilar || []) out.push({ tur: 'uyari', metin: String(u) });
    const ds = b.desteklenmeyen || [];
    if (ds.length) {
      out.push({ tur: 'kotu', metin: `${ds.length} yapı çevrilemiyor — betik bu hâliyle kaydedilemez:` });
      for (const x of ds) out.push({ tur: 'kotu', satir: x.satir || null, metin: `satır ${x.satir || '?'}: ${x.ad} — ${x.sebep}` });
    }
    return out;
  }

  /** Parametre şeması → kısa açıklama satırları. */
  function parametreSatirlari(b) {
    const sema = (b && b.paramSchema) || {};
    return Object.keys(sema).map(k => {
      const s = sema[k] || {};
      const sinir = [];
      if (s.min !== undefined) sinir.push(`en az ${s.min}`);
      if (s.max !== undefined) sinir.push(`en çok ${s.max}`);
      if (Array.isArray(s.values)) sinir.push(s.values.join(' | '));
      return { ad: String(s.label || k), ayrinti: `${k} · ${s.type || '?'} · varsayılan ${s.default}${sinir.length ? ' · ' + sinir.join(', ') : ''}${s.group ? ' · grup: ' + s.group : ''}` };
    });
  }

  /* ── Çizim ────────────────────────────────────────────────────────────── */

  function listeCiz() {
    const kap = bul('pineListe');
    if (!kap) return;
    if (!betikler.length) {
      AG.dom.doldur(kap, [el('p', { class: 'hint mb-0', text: 'Henüz kayıtlı betik yok. Betiği kaynak alanına yapıştırıp Denetle\'ye basın.' })]);
      return;
    }
    AG.dom.doldur(kap, betikler.map(b => el('button', {
      type: 'button',
      class: `pn-oge${b.anahtar === secili ? ' is-active' : ''}${b.derlenir ? '' : ' pn-bozuk'}`,
      'aria-pressed': b.anahtar === secili ? 'true' : 'false',
      onclick: () => betikAc(b.anahtar)
    }, [
      el('span', { class: 'pn-oge-ad', text: String(b.etiket || b.anahtar) }),
      el('span', { class: 'pn-oge-alt' }, [
        el('span', { class: 'sayi', text: `${b.parametre !== undefined ? b.parametre : '?'} parametre · ${b.satir || 0} satır` }),
        b.derlenir ? null : el('span', { class: 'tone-danger', text: ' · derlenmiyor' })
      ])
    ])));
  }

  function raporCiz(d) {
    const kap = bul('pineRapor'), durum = bul('pineDurum'), param = bul('pineParametreler');
    const satirlar = raporSatirlari(d);
    if (kap) AG.dom.doldur(kap, satirlar.map(x => el('div', { class: `pn-satir pn-${x.tur}`, text: x.metin })));
    if (durum) {
      const derlenir = !!(d && d.derlenir);
      AG.dom.doldur(durum, [el('span', {
        class: `badge ${d && d.ayristirmaHatasi ? 'badge-danger' : derlenir ? 'badge-success' : 'badge-danger'}`,
        text: d && d.ayristirmaHatasi ? 'ayrıştırılamadı' : derlenir ? 'kaydedilebilir' : 'kaydedilemez'
      })]);
    }
    if (param) {
      const p = parametreSatirlari(d && d.bilgi);
      AG.dom.doldur(param, p.length
        ? p.map(x => el('div', { class: 'pn-p' }, [el('strong', { text: x.ad }), el('span', { class: 'pn-p-alt', text: x.ayrinti })]))
        : [el('p', { class: 'hint mb-0', text: d && d.bilgi ? 'Ayarlanabilir parametre yok.' : '—' })]);
    }
  }

  function sonrakiGoster(anahtar, etiket) {
    kayitliAnahtar = anahtar || null;
    const k = bul('pineSonraki');
    if (k) k.classList.toggle('is-hidden', !anahtar);
    const m = bul('pineSonrakiMetin');
    if (m && anahtar) m.textContent = `"${etiket || anahtar}" strateji listesinde (Araştırma › Stratejiler, "Aday" grubu). Geçmiş veride ya da canlı fiyatlarla kâğıt hesapta deneyin.`;
  }

  /* ── Sunucu ───────────────────────────────────────────────────────────── */

  async function listeYukle() {
    try {
      const d = await AG.api.pineListe();
      betikler = d && d.success ? (d.betikler || []) : [];
    } catch (e) { betikler = []; }
    listeCiz();
  }

  async function betikAc(anahtar) {
    try {
      const d = await AG.api.pineOku(anahtar);
      if (!d || !d.success) { AG.bildir('Betik okunamadı: ' + ((d && d.error) || '')); return; }
      secili = anahtar;
      const k = bul('pineKaynak');
      if (k) k.value = d.kaynak || '';
      const a = bul('pineAnahtar');
      if (a) a.textContent = anahtar;
      bul('btnPineSil') && bul('btnPineSil').classList.remove('is-hidden');
      listeCiz();
      const b = betikler.find(x => x.anahtar === anahtar);
      const sonuc = await denetle();
      sonrakiGoster(sonuc && sonuc.derlenir ? anahtar : null, b && b.etiket);
    } catch (e) { AG.bildir('Betik okunamadı: ' + e.message); }
  }

  function yeni() {
    secili = null;
    const k = bul('pineKaynak');
    if (k) { k.value = ''; if (k.focus) k.focus(); }
    const a = bul('pineAnahtar');
    if (a) a.textContent = '(yeni)';
    bul('btnPineSil') && bul('btnPineSil').classList.add('is-hidden');
    const r = bul('pineRapor');
    if (r) AG.dom.doldur(r, [el('p', { class: 'hint mb-0', text: 'Betiği yapıştırıp Denetle\'ye basın.' })]);
    const p = bul('pineParametreler');
    if (p) AG.dom.doldur(p, [el('p', { class: 'hint mb-0', text: '—' })]);
    const d = bul('pineDurum');
    if (d) AG.dom.bosalt(d);
    sonrakiGoster(null);
    listeCiz();
  }

  async function denetle() {
    const kaynak = (bul('pineKaynak') || {}).value || '';
    if (!kaynak.trim()) { raporCiz({ ayristirmaHatasi: 'Betik boş.' }); return null; }
    let d;
    try { d = await AG.api.pineIncele({ kaynak }); } catch (e) { raporCiz({ ayristirmaHatasi: `İstek başarısız: ${e.message}` }); return null; }
    raporCiz(d);
    return d;
  }

  async function kaydet() {
    const d = await denetle();
    if (!d || !d.derlenir) { AG.bildir('Betik bu hâliyle kaydedilemez — denetim raporundaki satırları düzeltin.', 'uyari'); return; }
    const btn = bul('btnPineKaydet');
    AG.dom.mesgul(btn, 'Kaydediliyor…');
    try {
      const s = await AG.api.pineKaydet({ kaynak: bul('pineKaynak').value, anahtar: secili || undefined });
      if (!s || !s.success) { AG.bildir('Kaydedilemedi: ' + ((s && s.error) || '')); return; }
      secili = s.anahtar;
      bul('pineAnahtar').textContent = s.anahtar;
      bul('btnPineSil') && bul('btnPineSil').classList.remove('is-hidden');
      await listeYukle();
      // Strateji listeleri (Backtest / Kâğıt test seçicileri) yeni betiği görsün.
      if (typeof global.loadStrategyCatalog === 'function') { try { await global.loadStrategyCatalog(); } catch (e) { /* liste sonraki tazelemede gelir */ } }
      sonrakiGoster(s.anahtar, s.etiket);
      AG.bildir(`${s.guncelleme ? 'Güncellendi' : 'Kaydedildi'}: ${s.etiket} (${s.parametre} parametre). Şimdi Backtest'te ya da kâğıt testte deneyebilirsiniz.`, 'ok');
    } catch (e) {
      AG.bildir('Kaydedilemedi: ' + e.message);
    } finally { AG.dom.hazir(btn); }
  }

  async function sil() {
    if (!secili) return;
    const b = betikler.find(x => x.anahtar === secili);
    if (!(await AG.onayla({ baslik: 'Betik silinsin mi?', metin: `"${b ? b.etiket : secili}" silinecek. Bu betikle çalışan kâğıt botlar durdurulur.`, onay: 'Sil', tehlikeli: true }))) return;
    try {
      const d = await AG.api.pineSil(secili);
      if (!d || !d.success) { AG.bildir('Silinemedi: ' + ((d && d.error) || '')); return; }
      yeni();
      await listeYukle();
      if (typeof global.loadStrategyCatalog === 'function') { try { await global.loadStrategyCatalog(); } catch (e) { /* yok */ } }
    } catch (e) { AG.bildir('Silinemedi: ' + e.message); }
  }

  /** Seçiciye değeri yazar; seçenek yoksa false (katalog henüz tazelenmemiş). */
  function seciciyeYaz(id, anahtar) {
    const sel = bul(id);
    if (!sel || !anahtar) return false;
    const var_ = Array.prototype.some.call(sel.options || [], o => o.value === anahtar);
    if (!var_) return false;
    sel.value = anahtar;
    if (sel.dispatchEvent && global.Event) sel.dispatchEvent(new global.Event('change', { bubbles: true }));
    return true;
  }

  function backtesteGit() {
    if (!seciciyeYaz('btStrategy', kayitliAnahtar)) { AG.bildir('Strateji listesi henüz tazelenmedi — birkaç saniye sonra yeniden deneyin.', 'uyari'); return; }
    if (AG.pages.backtestEkran) AG.pages.backtestEkran.gorunum('kosu');
    AG.rota.git('arastirma/backtest');
    AG.bildir('Strateji seçildi. Sembol, zaman dilimi ve tarih aralığını seçip "Backtest çalıştır"a basın.', 'bilgi');
  }

  function kagidaGit() {
    if (!seciciyeYaz('dashSelectStrategy', kayitliAnahtar)) { AG.bildir('Strateji listesi henüz tazelenmedi — birkaç saniye sonra yeniden deneyin.', 'uyari'); return; }
    AG.rota.git('arsiv/kagit');
    AG.bildir('Strateji seçildi. Varlıkları işaretleyip "Kâğıt botları başlat"a basın.', 'bilgi');
  }

  function baslat() {
    if (!doc || baslat.bitti || !bul('tab-pine')) return;
    baslat.bitti = true;
    const bagla = (id, f) => { const e = bul(id); if (e) e.addEventListener('click', f); };
    bagla('btnPineDenetle', denetle);
    bagla('btnPineKaydet', kaydet);
    bagla('btnPineYeni', yeni);
    bagla('btnPineSil', sil);
    bagla('btnPineBacktest', backtesteGit);
    bagla('btnPineKagit', kagidaGit);
    // Sekme tuşu metin alanında girinti yapar (Pine girintiye duyarlı).
    const k = bul('pineKaynak');
    if (k) k.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const b = k.selectionStart, s = k.selectionEnd;
      k.value = k.value.slice(0, b) + '    ' + k.value.slice(s);
      k.selectionStart = k.selectionEnd = b + 4;
    });
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-pine' && !yuklendi) { yuklendi = true; listeYukle(); } });
    if (AG.rota && AG.rota.acikMi && AG.rota.acikMi('tab-pine')) { yuklendi = true; listeYukle(); }
  }
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
    else baslat();
  }

  AG.pages = AG.pages || {};
  /** Stratejiler ekranından "Betiği aç": listeyi yükler ve betiği editöre getirir. */
  async function ac(anahtar) { yuklendi = true; await listeYukle(); return betikAc(anahtar); }

  AG.pages.pine = { baslat, ac, raporSatirlari, parametreSatirlari, raporCiz, listeYukle, denetle, kaydet, yeni, backtesteGit, kagidaGit, durum: () => ({ secili, kayitliAnahtar, betikler: betikler.length }) };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.pine;
})(typeof window !== 'undefined' ? window : globalThis);
