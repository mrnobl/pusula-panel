'use strict';
/**
 * YAPAY ZEKÂ NOTLARI (74.1, PLAN-DIKKAT-LISTESI §F3) — DETERMİNİSTİK BİREBİR ALINTI DOĞRULAYICI (saf).
 * ═══════════════════════════════════════════════════════════════════════════
 * Modelin her iddiası bir KAYNAK kimliği, o kaynaktan KELİMESİ KELİMESİNE bir alıntı, kaynağın URL'si ve tarihi taşır.
 * Kabul şartları (hepsi; biri bozulursa iddia REDDEDİLİR ve nedeniyle ayrı tutulur — kabul edilenlere karışmaz):
 *   1. şema: iddia 5–300 karakter, alıntı metin, etiket o konu türünün sabit listesinde;
 *   2. kaynak kimliği o istekte verilen kaynaklardan biri;
 *   3. URL kaynağın URL'siyle AYNI (model URL uyduramaz; boşsa kaynağınki yazılır);
 *   4. alıntı ≥ 12 karakter ve ≥ 3 kelime, ≤ 400 karakter;
 *   5. alıntı kaynağın TEMİZLENMİŞ metninde birebir geçer — yalnız şu sadeleştirmeyle: Unicode NFKC, tipografik tırnak /
 *      kesme / tire / üç nokta tek biçime, ardışık boşluk tek boşluğa. Büyük-küçük harf KORUNUR; alıntının iki ucu kelime
 *      sınırında olmalı ("unhacked" içindeki "hacked" sayılmaz);
 *   6. kanarya simgesi (enjeksiyon denemesinin işareti) iddiada ya da alıntıda YOK.
 * Tarih her zaman KAYNAĞIN tarihidir (modelin yazdığı yalnız kayda geçer).
 */

const DOGRULAYICI_SURUM = 'alinti-v1';
const RED_NEDEN = {
  sema: 'çıktı şemaya uymuyor',
  'kaynak-bilinmiyor': 'kaynak kimliği verilen kaynaklarda yok',
  'url-uyusmuyor': 'URL kaynağın URL\'si değil',
  'alinti-kisa': 'alıntı çok kısa (en az 12 karakter, 3 kelime)',
  'alinti-uzun': 'alıntı çok uzun (en çok 400 karakter)',
  'alinti-yok': 'alıntı kaynak metninde kelimesi kelimesine geçmiyor',
  'etiket-gecersiz': 'etiket bu konu türünün listesinde değil',
  kanarya: 'enjeksiyon denemesinin işaretini taşıyor',
  tekrar: 'aynı iddia ikinci kez',
};

/** Saf: karşılaştırma için sadeleştirme (büyük-küçük harf korunur). */
function sadelestir(s) {
  return String(s == null ? '' : s).normalize('NFKC')
    .replace(/[‘’‚‛′ʼ`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−⁃﹘﹣－]/g, '-')
    .replace(/…/g, '...')
    .replace(/[​-‏⁠﻿­]/g, '')
    .replace(/\s+/g, ' ').trim();
}
const harfMi = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
const kelimeSayisi = (s) => (String(s).match(/[\p{L}\p{N}]+/gu) || []).length;

/** Saf: alıntı kaynakta kelime sınırlarıyla birebir geçiyor mu. @returns { ok, neden } */
function alintiDogrula(alinti, kaynakMetin) {
  if (typeof alinti !== 'string') return { ok: false, neden: 'sema' };
  const a = sadelestir(alinti).replace(/^["']+|["']+$/g, '').trim();
  if (a.length < 12 || kelimeSayisi(a) < 3) return { ok: false, neden: 'alinti-kisa' };
  if (a.length > 400) return { ok: false, neden: 'alinti-uzun' };
  const k = sadelestir(kaynakMetin);
  let i = k.indexOf(a);
  while (i >= 0) {
    const once = i > 0 ? k[i - 1] : '';
    const sonra = k[i + a.length] || '';
    const basHarf = harfMi(a[0]), sonHarf = harfMi(a[a.length - 1]);
    if (!(basHarf && harfMi(once)) && !(sonHarf && harfMi(sonra))) return { ok: true, neden: null, alinti: a };
    i = k.indexOf(a, i + 1);
  }
  return { ok: false, neden: 'alinti-yok' };
}

const metin = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Saf: model çıktısı → { kabul, red }.
 * @param cikti     modelin JSON'u ({ iddialar: [...] }) — bozuksa tek bir "sema" reddi
 * @param kaynaklar [{ id, url, tarih, metin }] — o isteğe verilen (temizlenmiş) kaynaklar
 * @param o         { etiketler: string[], incele: Set|string[], kanarya: string|null }
 */
function iddialariDogrula(cikti, kaynaklar, o = {}) {
  const kabul = [], red = [];
  const etiketler = new Set(o.etiketler || []);
  const incele = new Set(o.incele || []);
  const kan = o.kanarya ? String(o.kanarya) : null;
  const harita = new Map((kaynaklar || []).map(k => [String(k.id), k]));
  const l = cikti && Array.isArray(cikti.iddialar) ? cikti.iddialar : null;
  if (!l) return { kabul, red: [{ iddia: null, alinti: null, neden: 'sema', aciklama: RED_NEDEN.sema }] };
  const goruldu = new Set();
  for (const x0 of l.slice(0, 30)) {
    const x = x0 && typeof x0 === 'object' ? x0 : {};
    const kayit = { iddia: metin(x.iddia, 300), alinti: metin(x.alinti, 600), etiket: metin(x.etiket, 32), kaynakId: metin(x.kaynak, 16), url: metin(x.url, 500), modelTarih: metin(x.tarih, 40) };
    const reddet = (neden) => red.push({ ...kayit, neden, aciklama: RED_NEDEN[neden] || neden });
    if (kayit.iddia.length < 5 || !kayit.alinti) { reddet('sema'); continue; }
    if (kan && (kayit.iddia.includes(kan) || kayit.alinti.includes(kan))) { reddet('kanarya'); continue; }
    if (!etiketler.has(kayit.etiket)) { reddet('etiket-gecersiz'); continue; }
    const k = harita.get(kayit.kaynakId);
    if (!k) { reddet('kaynak-bilinmiyor'); continue; }
    if (kayit.url && kayit.url !== String(k.url)) { reddet('url-uyusmuyor'); continue; }
    const d = alintiDogrula(kayit.alinti, k.metin);
    if (!d.ok) { reddet(d.neden); continue; }
    const anahtar = `${kayit.etiket}|${sadelestir(kayit.alinti)}`;
    if (goruldu.has(anahtar)) { reddet('tekrar'); continue; }
    goruldu.add(anahtar);
    kabul.push({ ...kayit, alinti: d.alinti, url: String(k.url), tarih: k.tarih || null, incele: incele.has(kayit.etiket) });
  }
  return { kabul, red };
}

module.exports = { iddialariDogrula, alintiDogrula, sadelestir, DOGRULAYICI_SURUM, RED_NEDEN };
