'use strict';
/**
 * YAPAY ZEKÂ NOTLARI (74.1) — GOOGLE GEMINI REST İSTEMCİSİ (yerleşik fetch; yeni paket yok).
 * ═══════════════════════════════════════════════════════════════════════════
 * Yalnız ÜCRETSİZ KATMAN: faturalandırma gerektiren özellik (Google Search grounding, önbellek, toplu iş) KULLANILMAZ.
 * Anahtar URL'ye değil `x-goog-api-key` başlığına konur (günlük / hata metnine girmez). İstek: generateContent,
 * sıcaklık 0, `responseMimeType: application/json` + `responseSchema` (şema kısıtlı çıktı), araç (tools) YOK.
 * Hız: ücretsiz katman dakika sınırına uymak için istekler arası en az `aralikMs` (varsayılan 7 sn). 429:
 *   · günlük kota (QuotaFailure … PerDay) → hemen durur, `kota: 'gun'` (ertesi gün yeniden);
 *   · dakika sınırı → RetryInfo.retryDelay kadar (en çok 90 sn) bekler, en çok 2 kez yeniden dener.
 * 5xx → 15 sn sonra bir kez. 400/401/403 → hata (anahtar geçersiz, API kapalı, bölge desteklenmiyor) — yeniden denemez.
 */

const TABAN = 'https://generativelanguage.googleapis.com/v1beta';
const VARSAYILAN_MODEL = 'gemini-2.5-flash';
const MODEL_RE = /^[a-z0-9][a-z0-9.-]{2,60}$/;

/** Saf: metinden anahtarı ve olası sırları siler. */
function temizle(s, sirlar = []) {
  let t = String(s == null ? '' : s);
  for (const x of sirlar) if (x && String(x).length >= 8) t = t.split(String(x)).join('•••');
  return t.replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza•••').replace(/AQ\.[0-9A-Za-z._-]{20,}/g, 'AQ.•••').replace(/([?&]key=)[^&\s]+/gi, '$1•••').slice(0, 300);
}

/** Saf: Google hata gövdesi → { gunluk, bekleSn, mesaj }. */
function hataCoz(j) {
  const e = (j && j.error) || {};
  const ayr = Array.isArray(e.details) ? e.details : [];
  let gunluk = false, bekleSn = null;
  for (const d of ayr) {
    const tip = String(d['@type'] || '');
    if (/QuotaFailure$/.test(tip)) for (const v of d.violations || []) if (/PerDay|per_day|PerDayPer/i.test(String(v.quotaId || v.quotaMetric || ''))) gunluk = true;
    if (/RetryInfo$/.test(tip)) { const m = /^(\d+(?:\.\d+)?)s$/.exec(String(d.retryDelay || '')); if (m) bekleSn = Number(m[1]); }
  }
  if (!gunluk && /per day|daily|PerDay/i.test(String(e.message || ''))) gunluk = true;
  return { gunluk, bekleSn, mesaj: String(e.message || e.status || '').slice(0, 240), durum: e.status || null };
}

/**
 * @param o { anahtarFn: () → anahtar|null, model, fetch, bekle(ms), simdi, aralikMs, zamanAsimiMs }
 */
function olustur(o = {}) {
  const fetchFn = o.fetch || ((...a) => fetch(...a));
  const bekle = o.bekle || ((ms) => new Promise(r => setTimeout(r, ms)));
  const simdi = o.simdi || Date.now;
  const aralik = Number.isFinite(o.aralikMs) ? o.aralikMs : 7000;
  const zaman = o.zamanAsimiMs || 90000;
  let son = 0;
  const modelAdi = () => { const m = typeof o.model === 'function' ? o.model() : o.model; return MODEL_RE.test(String(m || '')) ? String(m) : VARSAYILAN_MODEL; };

  async function istek(url, govde, anahtar) {
    const bekleme = son + aralik - simdi();
    if (bekleme > 0) await bekle(bekleme);
    son = simdi();
    const ops = { method: govde ? 'POST' : 'GET', headers: { 'x-goog-api-key': anahtar, ...(govde ? { 'Content-Type': 'application/json' } : {}) }, redirect: 'error', signal: AbortSignal.timeout(zaman) };
    if (govde) ops.body = JSON.stringify(govde);
    const r = await fetchFn(url, ops);
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    return { status: r.status, ok: !!r.ok, j };
  }

  /**
   * Şema kısıtlı üretim. @returns { ok, json, metin, modelSurum, kullanim, hata, kota: 'gun'|null, istekSayisi }
   */
  async function uret(sistem, kullanici, sema, ek = {}) {
    const anahtar = o.anahtarFn ? o.anahtarFn() : null;
    if (!anahtar) return { ok: false, hata: 'anahtar yok', anahtarYok: true, istekSayisi: 0 };
    const model = modelAdi();
    const genCfg = { temperature: 0, topP: 1, candidateCount: 1, maxOutputTokens: ek.maxCikti || 2048, responseMimeType: 'application/json', responseSchema: sema };
    // 2.5 flash ailesinde "düşünme" kapatılır (ücretsiz kotayı ve gecikmeyi azaltır; çıktı daha kararlı).
    if (/^gemini-2\.5-flash/.test(model)) genCfg.thinkingConfig = { thinkingBudget: 0 };
    const govde = { systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: 'user', parts: [{ text: kullanici }] }], generationConfig: genCfg };
    const url = `${TABAN}/models/${encodeURIComponent(model)}:generateContent`;
    let sayi = 0;
    for (let deneme = 0; deneme < 4; deneme++) {
      let r;
      try { sayi++; r = await istek(url, govde, anahtar); } catch (e) {
        if (deneme < 1) { await bekle(15000); continue; }
        return { ok: false, hata: `Gemini'ye ulaşılamadı: ${temizle(e && e.message, [anahtar])}`, istekSayisi: sayi, model };
      }
      if (r.ok) {
        const c = r.j && Array.isArray(r.j.candidates) ? r.j.candidates[0] : null;
        const metin = c && c.content && Array.isArray(c.content.parts) ? c.content.parts.map(p => p.text || '').join('') : '';
        let json = null;
        try { json = JSON.parse(metin); } catch { json = null; }
        return { ok: !!json, json, metin: metin.slice(0, 20000), modelSurum: (r.j && r.j.modelVersion) || model, model, bitis: c ? c.finishReason || null : null,
          kullanim: r.j && r.j.usageMetadata ? { girdi: r.j.usageMetadata.promptTokenCount || 0, cikti: r.j.usageMetadata.candidatesTokenCount || 0 } : null,
          hata: json ? null : `model JSON döndürmedi${c && c.finishReason ? ` (${c.finishReason})` : ''}`, istekSayisi: sayi };
      }
      const h = hataCoz(r.j);
      if (r.status === 429) {
        if (h.gunluk) return { ok: false, kota: 'gun', hata: 'Gemini ücretsiz günlük kotası doldu — yarın devam edilir.', istekSayisi: sayi, model };
        if (deneme < 2) { await bekle(Math.min(90, Math.max(5, h.bekleSn == null ? 30 : h.bekleSn + 1)) * 1000); continue; }
        return { ok: false, kota: 'dakika', hata: 'Gemini dakika sınırı — yeniden denendi, yine yoğun.', istekSayisi: sayi, model };
      }
      if (r.status >= 500 && deneme < 1) { await bekle(15000); continue; }
      const neden = r.status === 400 && /API key not valid|API_KEY_INVALID/i.test(h.mesaj) ? 'anahtar geçersiz'
        : r.status === 403 ? 'erişim reddedildi (anahtar yetkisiz ya da Generative Language API kapalı)'
          : r.status === 404 ? `model bulunamadı (${model})`
            : /location is not supported|User location/i.test(h.mesaj) ? 'bulunduğunuz bölgede ücretsiz katman desteklenmiyor' : `HTTP ${r.status}`;
      return { ok: false, hata: `Gemini: ${neden}${h.mesaj ? ` — ${temizle(h.mesaj, [anahtar])}` : ''}`, durum: r.status, istekSayisi: sayi, model, anahtarHatasi: r.status === 400 || r.status === 401 || r.status === 403 };
    }
    return { ok: false, hata: 'Gemini: yeniden denemeler tükendi', istekSayisi: sayi, model };
  }

  /** SALT OKUMA sınama: models.list (ücretsiz, kota harcamaz). @returns { ok, hata, botAdi } (lib/anahtarlar.js sinamaDisari biçimi) */
  async function sina(anahtar0) {
    const anahtar = anahtar0 || (o.anahtarFn ? o.anahtarFn() : null);
    if (!anahtar) return { ok: false, hata: 'anahtar kayıtlı değil' };
    try {
      const r = await istek(`${TABAN}/models?pageSize=1000`, null, anahtar);
      if (!r.ok) { const h = hataCoz(r.j); return { ok: false, hata: `Google reddetti (HTTP ${r.status}${h.mesaj ? `: ${temizle(h.mesaj, [anahtar])}` : ''})` }; }
      const l = (r.j && Array.isArray(r.j.models) ? r.j.models : []).map(m => String(m.name || '').replace(/^models\//, ''));
      const model = modelAdi();
      const var_ = l.includes(model);
      return { ok: true, hata: null, botAdi: `${l.length} model erişilebilir${var_ ? ` · ${model} var` : ` · ${model} listede yok`}`, uyarilar: var_ || !l.length ? [] : [`${model} bu anahtarla görünmüyor — Yapay zekâ notları çalışmayabilir.`] };
    } catch (e) { return { ok: false, hata: `Google'a ulaşılamadı: ${temizle(e && e.message, [anahtar])}` }; }
  }

  return { uret, sina, modelAdi };
}

module.exports = { olustur, hataCoz, temizle, TABAN, VARSAYILAN_MODEL, MODEL_RE };
