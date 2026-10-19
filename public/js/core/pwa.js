/**
 * PWA + BAĞLANTI BANDI (60.5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Service worker (`/sw.js`) kaydı — yalnız güvenli bağlamda (HTTPS: Tailscale serve; ya da localhost).
 *    Yerel ağ köprüsü düz HTTP olduğu için orada SW yok (tarayıcı izin vermez); panel yine çalışır.
 *    SW yalnız kabuğu ağ-önce önbellekler, /api/ asla (public/sw.js).
 * 2. "Sunucuya ulaşılamıyor" bandı: 30 sn'de bir /api/health; cevap gelmezse (ya da tarayıcı çevrimdışıysa)
 *    `#baglantiBandi` görünür ve son başarılı zamanı söyler — ekrandaki sayılar o andan kalmadır.
 * 3. OTURUM SÜRESİ (panel denetimi A-21): telefon oturum çerezi 30 gün (lib/guvenlik.js OTURUM_SURE_SN); süre dolunca
 *    ya da jeton değişince API 403 "panel jetonu" döner. Bant "Oturum süresi doldu — yeniden giriş" der ve sayfayı
 *    yenileyen bağlantı verir (jetonsuz gezinmede sunucu giriş sayfasını gösterir).
 */
(function (global) {
  'use strict';
  const AG = global.AG = global.AG || {};
  const doc = global.document;
  const ARALIK_MS = 30000;
  let sonGorulen = null;
  let zamanlayici = null;

  const saat = (t) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  function bantGoster(acik) {
    const b = doc && doc.getElementById('baglantiBandi');
    if (!b) return;
    b.classList.toggle('is-hidden', !acik);
    if (acik) b.textContent = `Sunucuya ulaşılamıyor${sonGorulen ? ` — son görülen: ${saat(sonGorulen)}` : ''}. Ekrandaki bilgiler o andan kalma; bağlantı gelince kendiliğinden yenilenir.`;
  }

  /** Saf: 403 cevabı oturum/jeton reddi mi (sunucu metni: "panel jetonu eksik/yanlış", "Erişim reddedildi"). */
  function oturumReddiMi(durum, metin) {
    return durum === 403 && /panel jetonu|jeton|oturum/i.test(String(metin || ''));
  }

  function oturumBandi() {
    const b = doc && doc.getElementById('baglantiBandi');
    if (!b) return;
    b.classList.remove('is-hidden');
    const el = AG.dom && AG.dom.el;
    if (!el) { b.textContent = 'Oturum süresi doldu — sayfayı yenileyip yeniden giriş yapın.'; return; }
    AG.dom.doldur(b, [el('span', { text: 'Oturum süresi doldu (ya da panel jetonu değişti) — ekrandaki bilgiler eski. ' }),
      el('a', { href: '/', text: 'Yeniden giriş', onclick: (e) => { if (e && e.preventDefault) e.preventDefault(); global.location.reload(); } })]);
  }

  async function yokla() {
    if (global.navigator && global.navigator.onLine === false) { bantGoster(true); return false; }
    try {
      const r = await global.fetch('/api/health', { method: 'GET', cache: 'no-store' });
      if (r.status === 403) {
        let metin = '';
        try { const j = await r.json(); metin = (j && j.error) || ''; } catch (e) { /* JSON değil */ }
        if (oturumReddiMi(403, metin)) { oturumBandi(); return false; }
      }
      // 503 (bozuk durum) da sunucu AYAKTA demektir; yalnız ağ hatası/zaman aşımı bant açar.
      if (r.status >= 200 && r.status < 600) { sonGorulen = Date.now(); bantGoster(false); return true; }
    } catch (e) { /* ağ yok */ }
    bantGoster(true);
    return false;
  }

  function swKaydet() {
    const n = global.navigator;
    if (!n || !n.serviceWorker || !global.location) return false;
    const guvenli = global.isSecureContext || global.location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(global.location.hostname);
    if (!guvenli) return false;
    n.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* PWA olmadan da çalışır */ });
    return true;
  }

  function baslat() {
    swKaydet();
    yokla();
    if (!zamanlayici) zamanlayici = global.setInterval(yokla, ARALIK_MS);
    global.addEventListener('online', yokla);
    global.addEventListener('offline', () => bantGoster(true));
  }

  AG.pwa = { baslat, yokla, swKaydet, bantGoster, oturumReddiMi, oturumBandi, sonGorulen: () => sonGorulen };
  if (doc && doc.addEventListener) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
    else baslat();
  }
})(typeof window !== 'undefined' ? window : globalThis);
