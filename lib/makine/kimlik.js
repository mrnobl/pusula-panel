'use strict';
/**
 * MAKİNE KİMLİĞİ (75.2, 3a — TASARIM-MAKINE-HESAP-BOT §4.1) — <veri>/makine-kimlik.json (tür MAKINE: hiçbir pakete girmez).
 * `{ kimlik: 'm-<12 onaltılık>', ad, olusturma }`. İlk açılışta `crypto.randomBytes` ile bir kez üretilir, sonra hiç değişmez.
 * Taşıma dosyasına girmez: yeni bilgisayar = yeni kimlik (iki makine aynı kimliği taşıyamaz). Ad bilgisayar adıdır (yalnız gösterim).
 * Kuru deneme (PUSULA_KURU=1) ve salt okunur ortam: dosya yazılamazsa bellekte geçici kimlik + `kalici: false` (bir sonraki açılışta yeniden denenir).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { KIMLIK_RE } = require('./protokol');

/** Saf: bilgisayar adını gösterilebilir biçime indirir (harf, rakam, - _ .; en çok 64). */
function adTemizle(s) {
  const a = String(s || '').normalize('NFKC').replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 64);
  return a || 'bilgisayar';
}
function yeniKimlik() { return `m-${crypto.randomBytes(6).toString('hex')}`; }

/** Atomik yazım (geçici dosya + yeniden adlandırma). */
function yaz(dosya, nesne) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  const g = `${dosya}.${process.pid}.tmp`;
  fs.writeFileSync(g, JSON.stringify(nesne, null, 2), 'utf8');
  fs.renameSync(g, dosya);
}
function oku(dosya) {
  try { const j = JSON.parse(fs.readFileSync(dosya, 'utf8').replace(/^﻿/, '')); return j && KIMLIK_RE.test(String(j.kimlik || '')) ? j : null; } catch { return null; }
}

/**
 * Kimliği okur; yoksa üretip yazar. @param o.dosya (varsayılan yollar.veri('makine-kimlik.json')), o.ad (varsayılan os.hostname()).
 * @returns {{ kimlik, ad, olusturma, kalici: boolean }}
 */
function hazirla(o = {}) {
  const dosya = o.dosya || require('../yollar').veri('makine-kimlik.json');
  const var_ = oku(dosya);
  if (var_) return { kimlik: var_.kimlik, ad: adTemizle(var_.ad || o.ad || os.hostname()), olusturma: var_.olusturma || null, kalici: true };
  const yeni = { kimlik: yeniKimlik(), ad: adTemizle(o.ad || os.hostname()), olusturma: new Date().toISOString(),
    not: 'Pusula makine kimliği — bu bilgisayara özel; silinirse yeni kimlik üretilir ve eşlemeler yeniden yapılmalıdır.' };
  try { yaz(dosya, yeni); return { kimlik: yeni.kimlik, ad: yeni.ad, olusturma: yeni.olusturma, kalici: true }; }
  catch { return { kimlik: yeni.kimlik, ad: yeni.ad, olusturma: yeni.olusturma, kalici: false }; }
}

module.exports = { hazirla, oku, adTemizle, yeniKimlik };
