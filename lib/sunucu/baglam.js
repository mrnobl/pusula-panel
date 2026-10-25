/**
 * SUNUCU BAĞLAMI (74.8, C1 — TASARIM-MAKINE-HESAP-BOT §3) — server.js'ten bölünen `lib/sunucu/*` modüllerinin ortak bağlamı.
 *
 * server.js bağlamı bir kez, OKUYUCULARLA kurar: `olustur({ config: () => config, engine: () => engine, ... })`.
 * Her alan bir getter'dır; modül değeri KULLANIM ANINDA okur, kurulumda kopyalamaz. Böylece:
 *   · `let config` gibi yeniden atanan değişkenler hep güncel okunur (`ctx.config`),
 *   · server.js'te sonra tanımlanan değişkenler sorun olmaz (modül grubu server.js'teki eski yerinde bağlanır),
 *   · nesneler (bindirmeler, BINDIRME_ADLAR …) kopya değil AYNI başvuru olarak paylaşılır.
 * Tanımsız bir alan okunursa sessizce `undefined` dönmez, hata atar (yazım yanlışı açılışta görünür).
 */
'use strict';

function olustur(okuyucular) {
  const hedef = Object.create(null);
  for (const [ad, fn] of Object.entries(okuyucular || {})) {
    if (typeof fn !== 'function') throw new TypeError(`sunucu bağlamı: "${ad}" bir okuyucu işlev olmalı`);
    Object.defineProperty(hedef, ad, { get: fn, enumerable: true });
  }
  Object.freeze(hedef);
  return new Proxy(hedef, {
    get(t, ad) {
      if (typeof ad === 'symbol' || ad === 'then' || ad === 'toJSON' || ad === 'constructor') return undefined;
      if (!(ad in t)) throw new Error(`sunucu bağlamı: "${String(ad)}" alanı tanımlı değil (server.js baglam.olustur)`);
      return t[ad];
    },
    set(t, ad) { throw new Error(`sunucu bağlamı salt okunur ("${String(ad)}" yazılamaz — server.js değişkenini değiştirin)`); },
  });
}

module.exports = { olustur };
