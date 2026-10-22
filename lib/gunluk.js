/**
 * GÜNLÜKLER — tek biçimli olay kaydı (PLAN-PANEL-2 §0.4, kullanıcı kararı 2026-10-19)
 * ═══════════════════════════════════════════════════════════════════════════
 * Panelin bütün modülleri zaten tek kapıdan yazıyor: `db.addLog(seviye, mesaj)` (lib/database.js; bellekte son 300 satır).
 * Bu modül aynı satırı ayrıca gün dosyasına ekler ve süzülebilir kılar:
 *   data/gunluk/YYYY-MM-DD.jsonl   { t: ISO zaman, s: hata|uyari|islem|basari|bilgi, k: kaynak, b: bot|null, m: mesaj }
 * Kaynak ve bot mesajdan SAF kurallarla çıkarılır (`siniflandir`): modüllere dokunmadan bütün eski çağrılar tek biçime girer.
 * 30 günden eski dosyalar ilk yazımda silinir. Yazım sıralı (kuyruk) ve hata yutar — günlük yazılamadı diye bot durmaz.
 * Okuma: `oku({ saat, seviye, kaynak, ara, limit })` + `ozet()` (son 24 saat sayıları). Uç: GET /api/gunluk, /api/gunluk.csv.
 * Dizin: GUNLUK_DIZIN ortam değişkeni (öz test, kılavuz görüntüleri) — yoksa data/gunluk.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');

const SAKLA_GUN = 30;
const SEVIYE = { ERROR: 'hata', WARN: 'uyari', SUCCESS: 'basari', INFO: 'bilgi', TRADE: 'islem' };
const SEVIYELER = ['hata', 'uyari', 'islem', 'basari', 'bilgi'];
const SEVIYE_AD = { hata: 'hata', uyari: 'uyarı', islem: 'işlem', basari: 'başarı', bilgi: 'bilgi' };

/** Mesaj → kaynak. Sıra önemli: ilk eşleşen kazanır. */
const KAYNAK_KURAL = [
  [/\[TELEGRAM\]|Telegram/i, 'Telegram'],
  [/\[İLERİ\]|İleri test|ileri izle/i, 'İleri test'],
  [/İşlem defteri|Portföyüm/, 'Portföy'],
  [/📒|Araştırma defteri|Defter:/, 'Araştırma defteri'],
  [/Güncelleme|güncelleme|yeni sürüm/, 'Güncelleme'],
  [/[Yy]edek/, 'Yedek'],
  [/📦|Veri Sağlayıcı|^Veri:/, 'Veri'],
  [/Kairos|KAIROS|\bTao\b|\bTAO\b|Hücum|HÜCUM|Denge|DENGE|Kalkan|bindirme|[Kk]oruma stopu|[Aa]cil fren/, 'Botlar'],
  [/\[BORSA\]|\[[A-Z0-9]+\/[A-Z]+\]|Binance|Borsa|borsa/, 'Borsa'],
  [/Pine/, 'Pine'],
  [/Backtest|Walk-forward|OPTİMİZASYON|PARAMETRE|TARAMA TAMAMLAN|STRATEJİ TARAMA|ÖZEL İZLEME/, 'Araştırma'],
  [/Coin tarama|🔎|Dikkat|KAÇIN|İZLE/, 'Coin tarama'],
  [/📦|Veri|veri kayna/, 'Veri'],
  [/Tasarımcı|🧭|[Mm]odel|Portföy/, 'Portföy'],
  [/🤖 Bot|Bot Durduruldu|Aktif Strateji|İzleme Listesi|Finansman|kâğıt|Kâğıt/, 'Kâğıt test'],
  [/Sunucu|sunucu|port \d/, 'Sunucu'],
];
// 72.0: Kairos / Tao (eski adlar Hücum / Denge eski satırlarda da tanınır)
const BOTLAR = [['Kairos', /Kairos|KAIROS|Hücum|HÜCUM/], ['Tao', /\bTao\b|\bTAO\b|Denge|DENGE/], ['Kalkan', /Kalkan/], ['Donchian', /Donchian/]];
const ISLEM = /\b(alım|satım|alındı|satıldı|aldı|sattı|emri? dol|emir gönderildi|pozisyon (açıldı|kapandı))/i;

/** Saf: { kaynak, bot, seviye } */
function siniflandir(seviyeHam, mesaj) {
  const m = String(mesaj || '');
  let s = SEVIYE[String(seviyeHam || '').toUpperCase()] || 'bilgi';
  const kural = KAYNAK_KURAL.find(([r]) => r.test(m));
  const kaynak = kural ? kural[1] : 'Sistem';
  const bot = (BOTLAR.find(([, r]) => r.test(m)) || [null])[0];
  // İşlem: alım/satım sözcüğü + bot adı ya da sembol etiketi ("[BTC/USDT]") — "Önbelleğe alındı" gibi satırlar işlem sayılmaz.
  if ((s === 'bilgi' || s === 'basari') && ISLEM.test(m) && (bot || /\[[A-Z0-9]+\/[A-Z]+\]/.test(m))) s = 'islem';
  return { seviye: s, kaynak, bot };
}

const gunAdi = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function olustur(o = {}) {
  const dizin = o.dizin || process.env.GUNLUK_DIZIN || yollar.veri('gunluk');
  const simdi = o.simdi || (() => new Date());
  let kuyruk = Promise.resolve();
  let temizlenenGun = null;
  let surum = o.surum || null;   // 69.3: her satırda çalışan kodun izi (APP_VERSION@commit) — server.js surumAyarla

  function temizle(bugun) {
    if (temizlenenGun === bugun) return;
    temizlenenGun = bugun;
    try {
      const sinir = gunAdi(new Date(simdi().getTime() - SAKLA_GUN * 864e5));
      for (const f of fs.readdirSync(dizin)) { const m = f.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/); if (m && m[1] < sinir) fs.unlinkSync(path.join(dizin, f)); }
    } catch (e) { /* dizin yok ya da silinemedi: sonra yine denenir */ }
  }

  /** Bir satır ekler (sıralı, hata yutar). Döner: eklenecek kayıt. */
  function yaz(seviyeHam, mesaj) {
    const d = simdi();
    const c = siniflandir(seviyeHam, mesaj);
    const kayit = { t: d.toISOString(), s: c.seviye, k: c.kaynak, b: c.bot, m: String(mesaj == null ? '' : mesaj).slice(0, 2000), ...(surum ? { v: surum } : {}) };
    const dosya = path.join(dizin, `${gunAdi(d)}.jsonl`);
    kuyruk = kuyruk.then(() => new Promise((coz) => {
      try { fs.mkdirSync(dizin, { recursive: true }); } catch (e) { /* aşağıda appendFile hata verir */ }
      temizle(gunAdi(d));
      fs.appendFile(dosya, JSON.stringify(kayit) + '\n', () => coz());
    }));
    return kayit;
  }

  /** Bekleyen yazımlar bitince çözülür (öz test, kapanış). */
  const bekle = () => kuyruk;

  /** Son `saat` saatin dosyalarını okur (yeniden eskiye). */
  function hamOku(saat) {
    const bas = new Date(simdi().getTime() - saat * 36e5);
    const ilkGun = gunAdi(bas);
    let dosyalar = [];
    try { dosyalar = fs.readdirSync(dizin).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) >= ilkGun).sort().reverse(); } catch (e) { return []; }
    const basIso = bas.toISOString();
    const l = [];
    for (const f of dosyalar) {
      let metin = '';
      try { metin = fs.readFileSync(path.join(dizin, f), 'utf8'); } catch (e) { continue; }
      const satirlar = metin.split('\n');
      for (let i = satirlar.length - 1; i >= 0; i--) {
        if (!satirlar[i]) continue;
        let k; try { k = JSON.parse(satirlar[i]); } catch (e) { continue; }
        if (k && typeof k.t === 'string' && k.t >= basIso) l.push(k);
      }
    }
    return l.sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
  }

  /**
   * Süzülmüş okuma.
   * @param {object} q { saat (24), seviye ('' | hata | uyari+ = uyarı ve üstü | tek seviye), kaynak, bot, ara, limit (500) }
   */
  function oku(q = {}) {
    const saat = Math.min(Math.max(Number(q.saat) || 24, 1), SAKLA_GUN * 24);
    const limit = Math.min(Math.max(Number(q.limit) || 500, 1), 5000);
    const ara = String(q.ara || '').toLocaleLowerCase('tr-TR').trim();
    const sev = String(q.seviye || '');
    const sevUyan = sev === 'uyari+' ? new Set(['hata', 'uyari']) : sev ? new Set([sev]) : null;
    const tum = hamOku(saat);
    const l = tum.filter(k => (!sevUyan || sevUyan.has(k.s)) && (!q.kaynak || k.k === q.kaynak) && (!q.bot || k.b === q.bot)
      && (!ara || String(k.m).toLocaleLowerCase('tr-TR').includes(ara)));
    const kaynaklar = [...new Set(tum.map(k => k.k))].sort((a, b) => a.localeCompare(b, 'tr'));
    return { kayitlar: l.slice(0, limit), toplam: l.length, kesildi: l.length > limit, kaynaklar, saat };
  }

  /** Son 24 saat: seviye sayıları, hatanın/uyarının en çok geldiği kaynaklar, son hata. */
  function ozet() {
    const l = hamOku(24);
    const say = Object.fromEntries(SEVIYELER.map(s => [s, 0]));
    const kaynak = { hata: {}, uyari: {} };
    for (const k of l) {
      if (Object.hasOwn(say, k.s)) say[k.s] += 1;
      if (k.s === 'hata' || k.s === 'uyari') kaynak[k.s][k.k] = (kaynak[k.s][k.k] || 0) + 1;
    }
    const enCok = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([ad, adet]) => ({ ad, adet }));
    const sonHata = l.find(k => k.s === 'hata') || null;
    return { sayilar: say, olay: l.length, hataKaynak: enCok(kaynak.hata), uyariKaynak: enCok(kaynak.uyari), sonHata };
  }

  return { yaz, oku, ozet, bekle, dizin, surumAyarla: (v) => { surum = v ? String(v).slice(0, 40) : null; } };
}

/** CSV (; ayraçlı, Excel). */
function csv(kayitlar) {
  const h = (x) => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`;
  return '﻿Zaman;Seviye;Kaynak;Bot;Mesaj\n' + (kayitlar || []).map(k => [k.t, SEVIYE_AD[k.s] || k.s, k.k, k.b || '', k.m].map(h).join(';')).join('\n') + '\n';
}

/** Express yönlendiricisi (salt okuma; telefon kademesinde de açık — yalnız GET). */
function router(g, o = {}) {
  const express = require('express');
  const r = express.Router();
  r.get('/api/gunluk', (req, res) => {
    try {
      const q = req.query || {};
      res.json({ success: true, ...g.oku(q), ozet: g.ozet(), sunucuAcikSn: Math.round(process.uptime()), saklaGun: SAKLA_GUN });
    } catch (e) { res.status(500).json({ success: false, error: String(e.message).slice(0, 300) }); }
  });
  r.get('/api/gunluk.csv', (req, res) => {
    try {
      const v = g.oku({ ...(req.query || {}), limit: 5000 });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="pusula-gunluk-${gunAdi(new Date())}.csv"`);
      res.send(csv(v.kayitlar));
    } catch (e) { res.status(500).type('text/plain').send(String(e.message).slice(0, 300)); }
  });
  if (o.log) o.log('INFO', '📜 Günlükler: /api/gunluk hazır');
  return r;
}

module.exports = { olustur, siniflandir, csv, router, SEVIYELER, SEVIYE_AD, SAKLA_GUN, KAYNAK_KURAL };
