'use strict';
/**
 * İSTEK BAĞLAMI (64.8 denetim F5) — geliştirme bilgisayarından gelen yazmanın `x-istek-kimligi`'ni, isteğin bütün async zinciri
 * boyunca taşır (AsyncLocalStorage). lib/evYazma.js istekDefteri bu bağlamı açar; lib/islemDefteri/depo.js ve
 * lib/portfoyum/depo.js `ekle()` her eklenen kayda `istek: <kimlik>` yazar. Böylece "kayıt yazıldı ama yanıt defteri
 * (data/ev-istekler.json) yazılamadan süreç düştü" durumunda tekrar gelen istek, kayıt dosyasındaki `istek` alanından tanınır ve
 * ikinci kez uygulanmaz. Her yazma ucunu tek tek değiştirmeden aynı garanti (ekle() çağrısı nerede olursa olsun).
 */
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** f'yi kimlik bağlamında çalıştırır. */
function calistir(kimlik, f) { return als.run({ kimlik: String(kimlik) }, f); }
/** Geçerli isteğin kimliği (geliştirme kademesi yazması değilse null). */
function kimlik() { const s = als.getStore(); return s && UUID_RE.test(s.kimlik) ? s.kimlik : null; }

module.exports = { calistir, kimlik };
