'use strict';
/**
 * MAKİNE NABZI VE EŞ DURUMU (75.2, 3a — TASARIM-MAKINE-HESAP-BOT §4.1 makine-durum.json, §4.5 B1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Her makine NABIZ_MS'de (5 dk) bir, KAYITLI her eşe `POST /api/makine/nabiz` (makine kademesi) ile kendi özetini yollar
 * (sürüm, protokol, rol, botlar: kimlik/ad/mod/çalışıyor/nöbet, güncelleme durumu, boş disk). Eş yanıtında KENDİ özetini döner:
 * böylece tek yön çalışsa da iki taraf birbirini görür. Eş yoksa hiçbir istek yapılmaz.
 *
 * <veri>/makine-durum.json (MAKİNE): { surum, esler: { <kimlik>: { gelen: { zaman, uyum, ozet }, giden: { zaman, sonuc, hata, uyum, ozet,
 *   sonBasari } } }, yonetici: null }. `yonetici` (geçici devralma) 3b'de dolar. Eşten gelen her alan protokol şemasından geçer (temizle).
 * Bu modül karar vermez, emir vermez, bot başlatmaz/durdurmaz — yalnız görünürlük (B1 pano).
 */
const fs = require('fs');
const path = require('path');
const protokol = require('./protokol');
const istemci = require('./istemci');

const NABIZ_MS = 5 * 60 * 1000;
/** Pano rengi: son görülme bu süreden eskiyse "sessiz" (3 nabız kaçtı). */
const SESSIZ_MS = 15 * 60 * 1000;

function jsonOku(f, yedek) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return yedek; } }
function jsonYaz(f, n) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const g = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(g, JSON.stringify(n, null, 1), 'utf8');
  fs.renameSync(g, f);
}

/** Saf: bir eşin "son görülme" anı (gelen nabız ya da başarılı giden nabız yanıtı, hangisi yeniyse) — ms | null. */
function sonGorulme(d) {
  const t = [d && d.gelen && d.gelen.zaman, d && d.giden && d.giden.sonBasari].map(x => Date.parse(x || '')).filter(Number.isFinite);
  return t.length ? Math.max(...t) : null;
}
/** Saf: eşin en yeni özeti (gelen nabızdan ya da giden nabzın yanıtından, hangisi yeniyse). */
function enYeniOzet(d) {
  const g = d && d.gelen && d.gelen.ozet ? { z: Date.parse(d.gelen.zaman || '') || 0, o: d.gelen.ozet } : null;
  const c = d && d.giden && d.giden.ozet ? { z: Date.parse(d.giden.sonBasari || '') || 0, o: d.giden.ozet } : null;
  if (g && c) return g.z >= c.z ? g.o : c.o;
  return (g || c || {}).o || null;
}
/** Saf: pano ışığı. 'iyi' (≤ 15 dk) · 'sessiz' (daha eski) · 'hic' (hiç görülmedi) · 'red' (eş bu makineyi reddediyor) · 'uyumsuz'. */
function isik(d, simdiMs = Date.now()) {
  if (d && d.giden && d.giden.sonuc === 'red' && !(d.gelen && Date.parse(d.gelen.zaman || '') > Date.parse(d.giden.zaman || ''))) return 'red';
  const oz = enYeniOzet(d);
  if (oz && protokol.uyum(oz.protokol) === 'uyumsuz') return 'uyumsuz';
  const s = sonGorulme(d);
  if (s == null) return 'hic';
  return simdiMs - s <= SESSIZ_MS ? 'iyi' : 'sessiz';
}

/**
 * @param o.dosya   makine-durum.json yolu (varsayılan yollar.veri)
 * @param o.simdi   () → ms
 */
function olustur(o = {}) {
  const dosya = o.dosya || require('../yollar').veri('makine-durum.json');
  const simdi = o.simdi || Date.now;
  const log = o.log || (() => {});
  const zamanMetni = () => new Date(simdi()).toISOString();

  function oku() {
    const j = jsonOku(dosya, null);
    return { surum: 1, esler: (j && j.esler && typeof j.esler === 'object') ? j.esler : {}, yonetici: (j && j.yonetici) || null };
  }
  function yaz(d) { try { jsonYaz(dosya, d); } catch (e) { log('WARN', `🖧 Makine durumu yazılamadı: ${e.message}`); } }

  /** Eşten gelen nabız (gövde şemadan geçmiş olmalı). Fark > 1 ise özet saklanmaz (yalnız sürüm/protokol). */
  function gelenKaydet(kimlik, govde) {
    const d = oku();
    const u = protokol.uyum(govde.protokol);
    const ozet = u === 'uyumsuz' ? { protokol: govde.protokol, surum: String(govde.surum || '').slice(0, 24), kimlik } : protokol.temizle(protokol.OZET_SEMA, govde);
    d.esler[kimlik] = { ...(d.esler[kimlik] || {}), gelen: { zaman: zamanMetni(), uyum: u, ozet } };
    yaz(d);
    return u;
  }
  function gidenKaydet(kimlik, k) {
    const d = oku();
    const once = (d.esler[kimlik] && d.esler[kimlik].giden) || {};
    d.esler[kimlik] = { ...(d.esler[kimlik] || {}), giden: { zaman: zamanMetni(), sonuc: k.sonuc, hata: k.hata || null, uyum: k.uyum || once.uyum || null,
      ozet: k.ozet || once.ozet || null, sonBasari: k.sonuc === 'tamam' ? zamanMetni() : (once.sonBasari || null) } };
    yaz(d);
  }
  function esSil(kimlik) { const d = oku(); if (d.esler[kimlik]) { delete d.esler[kimlik]; yaz(d); } }

  /**
   * Bir eşe nabız yollar. @param es { kimlik, adres } @param ben { kimlik } @param jeton giden jeton @param ozet benim özetim
   * @returns {{ kimlik, sonuc: 'tamam'|'red'|'hata'|'uyumsuz', hata?, uyum? }}
   */
  async function birEseGonder(es, ben, jeton, ozet, ops = {}) {
    let r;
    try {
      r = await istemci.istek(es.adres, '/api/makine/nabiz', { method: 'POST', govde: ozet, ben: ben.kimlik, jeton, fetchFn: ops.fetchFn, zamanAsimiMs: ops.zamanAsimiMs });
    } catch (e) {
      const k = { sonuc: 'hata', hata: e.message };
      gidenKaydet(es.kimlik, k);
      return { kimlik: es.kimlik, ...k };
    }
    if (r.durum === 401 || r.durum === 403 || r.durum === 429) {
      const k = { sonuc: 'red', hata: `eş bu makineyi reddetti (${r.durum}): ${String((r.govde && r.govde.error) || '').slice(0, 160)} — eşleme silinmiş ya da jeton eskimiş olabilir; iki makineyi yeniden eşleyin.` };
      gidenKaydet(es.kimlik, k);
      return { kimlik: es.kimlik, ...k };
    }
    const g = r.govde || {};
    const v = protokol.dogrula('nabizYanit', g);
    if (r.durum === 409 && g && g.uyum === 'uyumsuz') {
      const k = { sonuc: 'uyumsuz', uyum: 'uyumsuz', hata: protokol.uyumMetni('uyumsuz'), ozet: { protokol: Number(g.protokol) || 0, surum: String(g.surum || '').slice(0, 24), kimlik: es.kimlik } };
      gidenKaydet(es.kimlik, k);
      return { kimlik: es.kimlik, sonuc: k.sonuc, hata: k.hata, uyum: k.uyum };
    }
    if (r.durum !== 200 || !v.ok) {
      const k = { sonuc: 'hata', hata: r.durum !== 200 ? `eş ${r.durum} döndü: ${String(g.error || '').slice(0, 160)}` : `eşin yanıtı protokole uymuyor: ${v.hatalar.slice(0, 3).join('; ')}` };
      gidenKaydet(es.kimlik, k);
      return { kimlik: es.kimlik, ...k };
    }
    if (g.kimlik !== es.kimlik) {
      const k = { sonuc: 'hata', hata: 'adresteki makine başka bir kimlik bildiriyor — adres değişmiş olabilir; yeniden eşleyin.' };
      gidenKaydet(es.kimlik, k);
      return { kimlik: es.kimlik, ...k };
    }
    const u = protokol.uyum(g.protokol);
    gidenKaydet(es.kimlik, { sonuc: 'tamam', uyum: u, ozet: protokol.temizle(protokol.OZET_SEMA, g) });
    return { kimlik: es.kimlik, sonuc: 'tamam', uyum: u };
  }

  /**
   * Bütün kayıtlı eşlere nabız. Eş yoksa HİÇBİR istek yapılmaz.
   * @param eslesme lib/makine/eslesme olustur() · ben { kimlik } · ozetFn () → benim özetim
   */
  let suruyor = null;
  async function tur({ eslesme, ben, ozetFn, fetchFn, zamanAsimiMs } = {}) {
    if (suruyor) return suruyor;
    suruyor = (async () => {
      const esler = eslesme.liste().makineler;
      if (!esler.length) return { esSayisi: 0, sonuclar: [] };
      const ozet = ozetFn();
      const sonuclar = [];
      for (const es of esler) {
        const jeton = eslesme.gidenJeton(es.kimlik);
        if (!jeton) { gidenKaydet(es.kimlik, { sonuc: 'hata', hata: 'bu eş için jeton yok — yeniden eşleyin' }); sonuclar.push({ kimlik: es.kimlik, sonuc: 'hata' }); continue; }
        sonuclar.push(await birEseGonder(es, ben, jeton, ozet, { fetchFn, zamanAsimiMs }));
      }
      return { esSayisi: esler.length, sonuclar };
    })();
    try { return await suruyor; } finally { suruyor = null; }
  }

  return { oku, gelenKaydet, gidenKaydet, esSil, birEseGonder, tur, dosya };
}

module.exports = { olustur, sonGorulme, enYeniOzet, isik, NABIZ_MS, SESSIZ_MS };
