/**
 * PUSULA SERVICE WORKER (PWA, 60.5) — yalnız UYGULAMA KABUĞU, ve yalnız ÇEVRİMDIŞI YEDEK olarak.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kurallar (PLAN-UYGULAMA-YOL-HARITASI.md §3c):
 *   · `/api/` ASLA önbelleklenmez ve SW'den geçmez (eski bot durumunu "güncel" göstermek tehlikeli).
 *     WebSocket zaten SW'ye uğramaz.
 *   · Kabuk dosyaları AĞ ÖNCE: her istek önce sunucuya gider; yanıt önbelleğe yazılır. Ağ yoksa son kopya
 *     döner (sayfada "sunucuya ulaşılamıyor" bandı — js/core/pwa.js). Böylece eski kabuk bağlantı varken
 *     ASLA kullanılmaz.
 *   · SÜRÜM KİLİDİ: önbellek adı sürümü taşır (`pusula-kabuk-<SURUM>`); yeni sürümün SW'si etkinleşince
 *     eski önbellekleri siler. SURUM, APP_VERSION ile aynı olmalı (scripts/panel-pwa-testi.js denetler).
 *   · Yalnız 200 yanıtlar önbelleğe girer: giriş sayfası (401) ve reddedilen istek (403) girmez.
 */
'use strict';
const SURUM = '73.1';
const ONBELLEK = `pusula-kabuk-${SURUM}`;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const adlar = await caches.keys();
    await Promise.all(adlar.filter(a => a.startsWith('pusula-kabuk-') && a !== ONBELLEK).map(a => caches.delete(a)));
    await self.clients.claim();
  })());
});

/** Yalnız aynı kökenli, GET, /api/ dışı istekler SW'den geçer. */
function kabukMu(istek) {
  if (istek.method !== 'GET') return false;
  const u = new URL(istek.url);
  if (u.origin !== self.location.origin) return false;
  if (u.pathname.startsWith('/api/')) return false;
  return true;
}

self.addEventListener('fetch', (e) => {
  if (!kabukMu(e.request)) return;   // tarayıcının kendi yolu: önbellek yok
  e.respondWith((async () => {
    try {
      const yanit = await fetch(e.request);
      if (yanit.ok && yanit.status === 200 && yanit.type === 'basic') {
        const kopya = yanit.clone();
        caches.open(ONBELLEK).then(c => c.put(e.request, kopya)).catch(() => { /* kota: önemsiz */ });
      }
      return yanit;
    } catch (hata) {
      const c = await caches.open(ONBELLEK);
      const eski = await c.match(e.request, { ignoreSearch: false }) || (e.request.mode === 'navigate' ? await c.match('/', { ignoreSearch: true }) : null);
      if (eski) return eski;
      throw hata;
    }
  })());
});
