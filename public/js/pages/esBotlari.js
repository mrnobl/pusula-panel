/**
 * BOTLAR › BAŞKA MAKİNEDEKİ BOTLAR (75.9, 3. faz parça 3c-2 — TASARIM-MAKINE-HESAP-BOT §4.5) `AG.pages.esBotlari`
 * ═══════════════════════════════════════════════════════════════════════════
 * Eşlenmiş SUNUCU makinelerinde çalışan botlar (taşınmış botlar dahil) Botlar › Özet'te ayrı, SALT OKUMA bir kartta: ad, makine, hesap
 * türü, durum, son nabız yaşı, "o makinede aç ↗" (eşin adresi varsa). Veri: GET /api/makine/pano (B1 — eşlerin son nabız özeti,
 * `botlar[]`: kimlik, mod, calisiyor, nobet, makine, tasima). Yeni uç yok, eşe istek yok (pano diskten okur).
 * Bir bot yalnız SAHİBİ olan makinenin satırında görünür (kayıt `makine` null = o makine, ya da o makinenin kimliği); başka makineye
 * taşınmış eski kopyalar atlanır. Bu bilgisayardaki eski kopya (bot buradan taşındı) Botlar › Genel kartında bir bantla işaretlenir.
 * YAZMA DÜĞMESİ YOK: işlemler botun çalıştığı makinenin panelinde (bağlantı yeni sekmede açılır). DOM AG.dom ile (HTML dizgesi yok).
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const MOD = { kagit: 'kâğıt', demo: 'demo', canli: 'canlı hesap' };
  const BOT_RE = /^[a-z][a-z0-9]{1,15}$/;
  const KIMLIK_RE = /^m-[0-9a-f]{12}$/;
  const ADRES_RE = /^https?:\/\/[a-z0-9.-]{1,200}(:\d{1,5})?$/i;
  const YENILE_MS = 60000;
  let veri = null, zamanDamga = 0, yukleniyor = null;

  /* ── Saf yardımcılar (öz test: scripts/es-botlari-selftest.js) ── */
  /** Saf: "x dk önce" (makineler.js onceMetni ile aynı biçim). */
  function onceMetni(iso, simdi = Date.now()) {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return 'hiç';
    const dk = Math.max(0, Math.round((simdi - t) / 60000));
    if (dk < 1) return 'az önce';
    if (dk < 60) return `${dk} dk önce`;
    const sa = Math.round(dk / 60);
    if (sa < 48) return `${sa} sa önce`;
    return `${Math.round(sa / 24)} gün önce`;
  }
  /** Saf: bot satırının durum metni + tonu (taşıma aşaması önce). */
  function durumMetni(b) {
    const t = b && b.tasima;
    if (t === 'yerlesiyor') return { metin: 'yerleşiyor (taşıma sürüyor)', ton: 'warn' };
    if (t === 'tasiniyor') return { metin: 'taşınıyor — başlamaz', ton: 'warn' };
    if (t === 'geldi' && !(b && b.calisiyor)) return { metin: 'taşındı — mutabakat ve Başlat bekliyor', ton: 'warn' };
    if (b && b.calisiyor) return { metin: 'çalışıyor', ton: 'pos' };
    return { metin: 'durmuş', ton: 'info' };
  }
  /** Saf: eşin adresinden bota bağlantı (adres geçersizse null). */
  function botAdresi(adres, kimlik) {
    const a = String(adres || '').replace(/\/+$/, '');
    if (!ADRES_RE.test(a) || !BOT_RE.test(String(kimlik || ''))) return null;
    return `${a}/#/botlar/${kimlik}`;
  }
  /**
   * Saf: pano → başka makinedeki bot satırları. Yalnız SUNUCU eşleri (geliştirme bilgisayarı bot çalıştırmaz); bot yalnız sahibinin
   * satırında (kayıt makine null ya da o eş); bu makineye ait (makine = ben) eski kopyalar atlanır.
   * @returns {{ sunucuEsi: number, satirlar: [{ kimlik, ad, makine, makineKimlik, mod, durum, ton, nobet, sonGorulme, yas, isik, eski, adres }] }}
   */
  function ayikla(pano, simdi = Date.now()) {
    const benK = pano && pano.ben && pano.ben.kimlik;
    const esler = (pano && Array.isArray(pano.makineler) ? pano.makineler : []).filter(m => m && m.rol === 'sunucu' && KIMLIK_RE.test(String(m.kimlik || '')) && m.kimlik !== benK);
    const satirlar = [];
    for (const m of esler) {
      for (const b of (Array.isArray(m.botlar) ? m.botlar : []).slice(0, 64)) {
        if (!b || !BOT_RE.test(String(b.kimlik || ''))) continue;
        const sahip = b.makine && KIMLIK_RE.test(String(b.makine)) ? b.makine : m.kimlik;
        if (sahip !== m.kimlik) continue;   // o makinedeki eski kopya (bot başka makineye taşındı)
        const d = durumMetni(b);
        satirlar.push({ kimlik: b.kimlik, ad: (AG && AG.botAd && AG.botAd.ad && AG.botAd.ad(b.kimlik)) || String(b.adGorunen || b.kimlik).slice(0, 60),
          makine: String(m.ad || m.kimlik).slice(0, 64), makineKimlik: m.kimlik, mod: b.mod || null, durum: d.metin, ton: d.ton,
          nobet: Number.isFinite(b.nobet) ? b.nobet : 0, sonGorulme: m.sonGorulme || null, yas: onceMetni(m.sonGorulme, simdi),
          isik: m.isik || null, eski: m.isik !== 'iyi', adres: botAdresi(m.adres, b.kimlik) });
      }
    }
    return { sunucuEsi: esler.length, satirlar };
  }
  /**
   * Saf: bu bilgisayardaki bot başka makineye taşınmış mı (bot kaydı `makine` başka bir kimlik) → { makine, adres, nobet } | null.
   * Kaynak: pano `ben.botlar` (bu makinenin özeti) + eş satırı (ad, adres).
   */
  function yerelTasinmis(pano, kimlik) {
    const benK = pano && pano.ben && pano.ben.kimlik;
    const b = ((pano && pano.ben && pano.ben.botlar) || []).find(x => x && x.kimlik === kimlik);
    if (!b || !b.makine || b.makine === benK || !KIMLIK_RE.test(String(b.makine))) return null;
    const m = ((pano && pano.makineler) || []).find(x => x && x.kimlik === b.makine) || null;
    return { makine: m ? String(m.ad || m.kimlik).slice(0, 64) : b.makine, adres: m ? botAdresi(m.adres, kimlik) : null, nobet: Number.isFinite(b.nobet) ? b.nobet : 0 };
  }

  /* ── Çizim ── */
  function baglanti(adres) {
    return adres ? el('a', { href: adres, target: '_blank', rel: 'noopener noreferrer', class: 'no-underline', text: 'o makinede aç ↗' }) : el('span', { class: 'df-soluk', text: 'adres yok' });
  }
  function ciz() {
    const k = bul('botEsKap');
    if (!k) return;
    const a = veri ? ayikla(veri) : { sunucuEsi: 0, satirlar: [] };
    // Eşlenmiş sunucu yoksa kart hiç görünmez (tek makine — bugünkü görünüm); yalnız Botlar › Özet açıkken (bölümde .bozet-acik)
    const b = bul('tab-botlar');
    const ozetAcik = !b || !b.classList || b.classList.contains('bozet-acik');
    k.classList.toggle('is-hidden', !a.sunucuEsi || !ozetAcik);
    if (!a.sunucuEsi) { doldur(k, []); return; }
    const bas = el('div', { class: 'mb-3' }, [
      el('h3', { class: 'card-title mb-1' }, [el('i', { 'data-lucide': 'server', class: 'tone-primary' }), el('span', { text: ' Başka makinelerdeki botlar' })]),
      el('p', { class: 'hint mb-0', text: 'Eşlenmiş sunucularda çalışan botlar — son nabızdan (5 dakikada bir). Salt okuma: Başlat, Durdur ve ayarlar botun çalıştığı makinenin panelinde.' })
    ]);
    if (!a.satirlar.length) { doldur(k, [bas, el('p', { class: 'hint mb-0', id: 'botEsBos', text: 'Eşlenmiş sunucularda bot yok (ya da henüz nabız gelmedi).' })]); return; }
    const tablo = AG.tablo.kutulu({ id: 'tblBotEs', sinif: 'table-dense pf-tablo', basliklar: ['Bot', 'Makine', 'Hesap', 'Durum', 'Son nabız', ''],
      satirlar: a.satirlar.map(s => el('tr', { id: `botEs-${s.makineKimlik}-${s.kimlik}` }, [
        el('td', { class: 'fw-semibold', text: s.ad }),
        el('td', { text: s.makine }),
        el('td', { class: 'df-soluk', text: MOD[s.mod] || s.mod || '—' }),
        el('td', null, [el('span', { class: `p-rozet p-rozet-${s.ton}`, text: s.durum })]),
        el('td', { class: s.eski ? 'tone-warning' : '', text: `${s.yas}${s.eski ? ' — bilgi eski olabilir' : ''}` }),
        el('td', null, [baglanti(s.adres)])
      ])) });
    doldur(k, [bas, tablo]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }
  /** Botlar › Genel: bu bilgisayardaki eski kopyanın kartına bant (bot başka makinede çalışıyor). */
  function yerelBantlar(adlar) {
    if (!veri) return;
    for (const ad of adlar || []) {
      const ust = bul(`botKartUst-${ad}`);
      if (!ust) continue;
      const eski = bul(`botEsBant-${ad}`);
      if (eski && eski.parentNode) eski.parentNode.removeChild(eski);
      const t = yerelTasinmis(veri, ad);
      if (!t) continue;
      ust.insertBefore(el('div', { class: 'hint hint-sm tone-warning mb-2', id: `botEsBant-${ad}` }, [
        el('span', { text: `Bu bot artık ${t.makine} makinesinde çalışıyor (nöbet ${t.nobet}) — buradaki kopya salt okunur, işlemler o makinede. ` }),
        t.adres ? baglanti(t.adres) : null
      ]), ust.firstChild);
    }
  }
  /** Pano okunur (60 sn önbellek); eski sunucu / hata → kart gizli kalır. */
  async function yukle(zorla) {
    if (!AG.api || !AG.api.makine || typeof AG.api.makine.pano !== 'function') return veri;
    if (!zorla && veri && Date.now() - zamanDamga < YENILE_MS) { ciz(); return veri; }
    if (yukleniyor) return yukleniyor;
    yukleniyor = (async () => {
      try { const r = await AG.api.makine.pano(false); veri = r && r.success ? r : null; } catch (e) { veri = null; }
      zamanDamga = Date.now();
      ciz();
      return veri;
    })();
    try { return await yukleniyor; } finally { yukleniyor = null; }
  }

  AG.pages = AG.pages || {};
  AG.pages.esBotlari = { yukle, ciz, ayikla, yerelTasinmis, durumMetni, botAdresi, onceMetni, yerelBantlar, _veriAyarla: (v) => { veri = v; zamanDamga = Date.now(); ciz(); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.esBotlari;
})(typeof window !== 'undefined' ? window : globalThis);
