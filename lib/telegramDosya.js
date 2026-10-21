/**
 * Sunucu DIŞINDAKİ süreçler için Telegram (61.4): güncelleyici (scripts/guncelle.js) ve tasarımcı alt süreci
 * (lib/tasarimci/zamanlayici.js tik). Ayar sunucuyla aynı yerden: config.json `telegram` + data/secrets.json `telegram.botToken`.
 * Telegram kapalıysa / jeton ya da sohbet yoksa sessizce false döner. Araştırma kopyasında (data/makine.json arastirmaModu)
 * HİÇ göndermez — Telegram'ı yalnız sunucu kullanır (aynı jetonu iki bilgisayar dinlemesin).
 * Döndürür: (seviye, baslik, satirlar) → Promise<boolean>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');

function oku(dosya) { try { return JSON.parse(fs.readFileSync(dosya, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } }

function telegramDosyadan(kok = path.join(__dirname, '..')) {
  const makine = oku(yollar.programVeri(kok, 'makine.json'));
  if (makine && makine.arastirmaModu) return async () => false;
  let cfg = null; try { cfg = require('./ayarlar').oku(kok); } catch (e) { cfg = null; }   // 68.0: varsayılan ⊕ ayarlar.json (eski: config.json)
  if (!cfg) return async () => false;
  const gizli = require('./sirKasasi').okuGuvenli(yollar.programVeri(kok, 'secrets.json'), {});   // 69.4 DPAPI
  if (gizli.telegram && gizli.telegram.botToken) cfg.telegram = { ...(cfg.telegram || {}), botToken: gizli.telegram.botToken };
  try {
    const T = require('./telegram');
    const t = new T(cfg);
    // Ayrı süreçlerin (yedek, güncelleme …) mesajları da bildirim merkezinden geçer: aynı aç/kapat, aynı kayıt.
    try { t.merkezBagla(require('./bildirimMerkezi').olustur({ kok, varsayilan: () => ({ islem: t.notifyTrades, hata: t.notifyErrors, yasam: t.notifyLifecycle }) })); }
    catch (e) { /* merkez yoksa eski davranış */ }
    return (seviye, baslik, satirlar) => (t.enabled && t.botToken && t.chatId ? t.notify(seviye, baslik, satirlar, { throttleMs: 0 }) : Promise.resolve(false));
  } catch (e) { return async () => false; }
}

module.exports = { telegramDosyadan };
