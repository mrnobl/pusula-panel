/**
 * BİLDİRİM MERKEZİ — Telegram'a giden her mesaj tek yerde (PLAN-PANEL-2 §0.3, kullanıcı kararı 2026-10-19)
 * ═══════════════════════════════════════════════════════════════════════════
 * Panelde iki gönderim yolu var: motorun `notify` katmanı (lib/telegram.js) ve portföy botlarının `Bildirici`'si
 * (lib/live/isletim.js). İkisi de sonunda `TelegramNotifier.sendMessageDetailed(metin)` kapısından geçer. Merkez o kapıya
 * bağlanır (`telegram.merkezBagla(m)`): bot koduna dokunmadan
 *   · her giden mesajı KATALOG'daki bir türe ayırır (`siniflandir` — simge + başlık kuralları, SAF),
 *   · tür kapalıysa göndermez (çağırana "gönderildi sayılır" döner — giden kutusu boşuna yeniden denemesin),
 *   · her denemeyi kayda geçer (data/bildirim-gecmis.jsonl; son 1000 satır).
 * "Acil durum" kilitlidir: kapatılamaz (kullanıcı kararı). Ayarlar data/bildirim-ayar.json (yalnız değiştirilen türler);
 * ilk açılışta eski config.json bayrakları (notifyTrades/notifyErrors/notifyLifecycle) varsayılan olur.
 * Metin düzenleme ve yeni türler SONRAKİ adım (kullanıcı kararı) — burada yalnız aç/kapat ve kayıt.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');

/** Katalog: sıra ekrandaki sıradır. `eslesme` sınıflandırmada kullanılır (bkz. SIRA). */
const KATALOG = [
  { id: 'acil', grup: 'Botlar', ad: 'Acil durum', aciklama: 'Acil durdurma, bot durduruldu, koruma stopu konamadı, kayıt uyuşmazlığı, çökme, kurulamayan güncelleme', onem: 'kritik', kilitli: true },
  { id: 'islem', grup: 'Botlar', ad: 'İşlem yapıldı', aciklama: 'Bot bir coin aldığında ya da sattığında (günün işlemleri)', onem: 'bilgi' },
  { id: 'ozet', grup: 'Botlar', ad: 'Günlük bot özeti', aciklama: 'Botun her günkü çalışmasından sonra: karar, hesap değeri, koruma stopu', onem: 'bilgi' },
  { id: 'yasam', grup: 'Botlar', ad: 'Başlatma / durdurma', aciklama: 'Sunucu ya da bot başladığında, bağlantı kurulduğunda, piyasa verisi geri geldiğinde', onem: 'bilgi' },
  { id: 'hata', grup: 'Botlar', ad: 'Uyarı ve hata', aciklama: 'Borsaya ya da veriye ulaşılamadı, uygulama sapması, disk dolmak üzere gibi dikkat isteyen durumlar', onem: 'uyari' },
  { id: 'rapor', grup: 'Portföy ve raporlar', ad: 'Günlük / haftalık rapor', aciklama: 'Her sabah 09:00 günlük rapor özeti, pazartesi haftalık özet', onem: 'bilgi' },
  { id: 'model', grup: 'Portföy ve raporlar', ad: 'Model uygulama günü', aciklama: 'Model portföylerin alım-satım listesi (kâğıt hesap) hazır olduğunda', onem: 'bilgi' },
  { id: 'tarama', grup: 'Araştırma ve sistem', ad: 'Coin tarama / Dikkat listesi', aciklama: 'Kaçın / izle listesine yeni coin girdiğinde', onem: 'bilgi' },
  { id: 'ileri', grup: 'Araştırma ve sistem', ad: 'İleri test', aciklama: 'Bir ileri test uyarı ya da alarm eşiğini aştığında, demo kabul notları', onem: 'uyari' },
  { id: 'guncelleme', grup: 'Araştırma ve sistem', ad: 'Güncelleme', aciklama: 'Yeni sürüm onay bekliyor, elle bakılmalı ya da GitHub\'a ulaşılamıyor', onem: 'bilgi' },
  { id: 'yedek', grup: 'Araştırma ve sistem', ad: 'Yedek', aciklama: 'Otomatik yedek alınamadığında', onem: 'uyari' },
  { id: 'diger', grup: 'Araştırma ve sistem', ad: 'Diğer', aciklama: 'Yukarıdaki türlere girmeyen mesajlar', onem: 'bilgi' },
  { id: 'deneme', grup: null, ad: 'Deneme mesajı', aciklama: 'Panelden gönderilen deneme', onem: 'bilgi', kilitli: true, gizli: true },
];
const TURLER = new Set(KATALOG.map(t => t.id));

/** Saf: HTML'siz ilk satır (başlık). */
function baslikAyir(metin) {
  const ilk = String(metin || '').split('\n').find(s => s.trim()) || '';
  return ilk.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim().slice(0, 200);
}

/** Saf: metin → katalog türü. Sıra: deneme → acil (🚨, kilitli) → alan kuralları → simge. */
function siniflandir(metin) {
  const t = String(metin || '');
  const b = baslikAyir(t);
  if (/Test Bildirimi|Deneme mesajı/i.test(b)) return 'deneme';
  if (/^🚨/.test(b)) return 'acil';
  if (/^📋|[Gg]ünlük rapor|[Hh]aftalık (rapor|özet)/.test(b)) return 'rapor';
  if (/Dikkat listesi|Coin tarama|KAÇIN|İzle listesi/.test(b)) return 'tarama';
  if (/İleri test|876|CBDR|Bollinger|[Dd]emo kabul|gerçekleşen vs gölge|uygulama sapması/.test(b)) return 'ileri';
  if (/Pusula güncellemesi|kurulmayı bekliyor|Pusula [\d.]+ (kuruldu|kurulamadı)/.test(b)) return 'guncelleme';
  if (/[Yy]edek/.test(b)) return 'yedek';
  if (/alım-satım \(kâğıt hesap\)|uygulama günü|[Bb]u ay(ın)? emir/.test(b)) return 'model';
  if (/^💱|^🟢|^🔴|TRADE ALERT/.test(b)) return 'islem';
  if (/^📊/.test(b)) return 'ozet';
  if (/^⚠️|^⚠/.test(b)) return 'hata';
  if (/^ℹ️|^ℹ/.test(b)) return 'yasam';
  return 'diger';
}

function olustur(o = {}) {
  const kok = o.kok || path.join(__dirname, '..');
  const ayarDosya = o.ayarDosya || yollar.programVeri(kok, 'bildirim-ayar.json');
  const gecmisDosya = o.gecmisDosya || yollar.programVeri(kok, 'bildirim-gecmis.jsonl');
  const varsayilan = typeof o.varsayilan === 'function' ? o.varsayilan : () => ({});
  const GECMIS_TAVAN = 1000;
  let ayar = {};
  try { ayar = JSON.parse(fs.readFileSync(ayarDosya, 'utf8')) || {}; } catch (e) { ayar = {}; }
  let gecmis = [];
  try { gecmis = fs.readFileSync(gecmisDosya, 'utf8').split('\n').filter(Boolean).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean).slice(-GECMIS_TAVAN); } catch (e) { gecmis = []; }

  function acikMi(tur) {
    const k = KATALOG.find(x => x.id === tur);
    if (!k || k.kilitli) return true;
    if (Object.hasOwn(ayar, tur)) return ayar[tur] !== false;
    const v = varsayilan();
    return Object.hasOwn(v, tur) ? v[tur] !== false : true;
  }

  function ayarla(tur, acik) {
    const k = KATALOG.find(x => x.id === tur);
    if (!k) throw Object.assign(new Error(`Bilinmeyen bildirim türü: ${tur}`), { durum: 400 });
    if (k.kilitli) throw Object.assign(new Error(`"${k.ad}" kapatılamaz.`), { durum: 400 });
    ayar = { ...ayar, [tur]: !!acik };
    fs.mkdirSync(path.dirname(ayarDosya), { recursive: true });
    const gecici = ayarDosya + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(ayar, null, 2), 'utf8');
    fs.renameSync(gecici, ayarDosya);
    return acikMi(tur);
  }

  /** Bir denemeyi kaydeder: sonuc 'gonderildi' | 'kapali' | 'hata'. */
  function kaydet(k) {
    const satir = { zaman: new Date().toISOString(), tur: k.tur, baslik: baslikAyir(k.metin), sonuc: k.sonuc, hata: k.hata ? String(k.hata).slice(0, 300) : null };
    gecmis.push(satir);
    if (gecmis.length > GECMIS_TAVAN) gecmis = gecmis.slice(-GECMIS_TAVAN);
    try {
      fs.mkdirSync(path.dirname(gecmisDosya), { recursive: true });
      fs.appendFileSync(gecmisDosya, JSON.stringify(satir) + '\n');
      // Dosya tavanın iki katına ulaşınca kırpılır (yalnız son 1000 satır kalır).
      if (gecmis.length === GECMIS_TAVAN && fs.statSync(gecmisDosya).size > 400 * 1024) fs.writeFileSync(gecmisDosya, gecmis.map(x => JSON.stringify(x)).join('\n') + '\n');
    } catch (e) { /* kayıt yazılamadı — gönderim etkilenmez */ }
    return satir;
  }

  /** Ekran: katalog + açık/kapalı + son gönderim, son mesajlar. */
  function gorunum(n = 50) {
    const son = {};
    for (const g of gecmis) if (g.sonuc === 'gonderildi') son[g.tur] = g.zaman;
    return {
      katalog: KATALOG.filter(k => !k.gizli).map(k => ({ ...k, acik: acikMi(k.id), sonGonderim: son[k.id] || null })),
      gecmis: gecmis.slice(-n).reverse(),
    };
  }

  /** Sade metin (lib/bildirimMetinleri.js; kullanıcı kararı 2026-10-19). Hata olursa mesaj aynen gider. */
  function bicimle(metin) { try { return require('./bildirimMetinleri').bicimle(metin); } catch (e) { return metin; } }

  return { siniflandir, acikMi, ayarla, kaydet, gorunum, bicimle };
}

/**
 * Express yönlendiricisi. GET /api/bildirim (katalog + geçmiş + Telegram durumu), POST /api/bildirim/ayar { tur, acik }.
 * @param m merkez · @param o { durum: () => { bagli, neden }, log }
 */
function router(m, o = {}) {
  const express = require('express');
  const r = express.Router();
  r.get('/api/bildirim', (req, res) => {
    try { res.json({ success: true, ...m.gorunum(Number((req.query || {}).n) || 50), telegram: o.durum ? o.durum() : null }); }
    catch (e) { res.status(500).json({ success: false, error: String(e.message).slice(0, 300) }); }
  });
  r.post('/api/bildirim/ayar', express.json({ limit: '4kb' }), (req, res) => {
    try {
      const b = req.body || {};
      const acik = m.ayarla(String(b.tur || ''), b.acik === true || b.acik === 'true');
      if (o.log) o.log('INFO', `🔔 Bildirim merkezi: "${b.tur}" ${acik ? 'açıldı' : 'kapatıldı'}`);
      res.json({ success: true, tur: b.tur, acik });
    } catch (e) { res.status(e.durum || 500).json({ success: false, error: String(e.message).slice(0, 300) }); }
  });
  return r;
}

module.exports = { olustur, siniflandir, baslikAyir, router, KATALOG, TURLER };
