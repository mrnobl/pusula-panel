#!/usr/bin/env node
/**
 * PORTFÖY KATALOĞU ISITMA — lib/veri/orkestrator.js 'katalog-onbellegi' adımı bunu ALT SÜREÇ olarak çağırır.
 * Neden alt süreç: katalog yeniden kurulumu ~9 sn SENKRON CPU; sunucu sürecinde koşsa (canlı bot aynı süreçte) olay
 * döngüsünü o kadar bloklar. Burada kurulur, disk önbelleklerine yazılır (data/portfoy/onbellek/katalog.json +
 * strateji-*.json seviye önbellekleri); sunucu yalnız bellek önbelleğini düşürür ve diskten (~30 ms) okur.
 * Çıktı: son satır JSON { varlik, kaynakHatalari, isinma }.
 */
'use strict';
const KAT = require('../lib/portfoy/katalog');
const k = KAT.katalog({ yenile: true });
const isinma = {};
for (const id of ['strateji:hucum', 'strateji:denge', 'strateji:btc-altut', 'strateji:btc-ogc']) {
  try { if (KAT.varMi(id)) { require('../lib/portfoy/seri').seriPaket(id, { birim: 'USD' }); isinma[id] = 'tamam'; } } catch (e) { isinma[id] = e.message.slice(0, 120); }
}
console.log(JSON.stringify({ varlik: k.varliklar.length, kaynakHatalari: Object.keys(k.kaynakHatalari || {}), isinma }));
