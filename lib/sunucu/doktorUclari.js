/**
 * PUSULA DOKTORU uçları (F1, 78.1; lib/doktor/*) — HEPSİ SALT OKUMA (GET), telefonda da açık; araştırma kopyasında lib/evOkuma.js EV_YOLU
 * ile sunucudan okunur (sunucu bağlantısı kuruluysa). Makine kademesine (eş makine) AÇIK DEĞİL (lib/guvenlik.js MAKINE_OKUMA'da yok).
 *   GET /api/doktor?gun=1..30   teşhis kartları (Sorun merkezi + Doktor kuralları D1/D2/D3/D10) · onarım günlüğü · hazır olma · bakım durumu
 *                               · Pusula'nın kendiliğinden yaptığı onarımlar listesi · Doktor'un sınırları (K1/K2)
 *   GET /api/hazir[?taze=1]     hazır olma (readiness): süreç + öz denetim son yoklama yaşı + çalışan her bindirme botunun bağlı / ENGEL /
 *                               güvenli kip / son karar yaşı. /api/health'e DOKUNULMADI (donma bekçisi ve healthchecks oradan; K6: /api/hazir
 *                               healthchecks'e bağlanmaz). Hazır olmamak hiçbir eylem doğurmaz.
 * Zamanlayıcı: D2 geçici tatbikat artığı temizliği — açılıştan 20 dk sonra, sonra saatte bir denenir; TR günü başına en çok bir kez, TR
 * 02:30–04:30 dışında (lib/doktor/index.js bakimTik). DOKTOR=0 kapatır. D1 (konsol günlüğü döndürme) burada DEĞİL: scripts/denetleyici-bekle.js
 * --basla (node server.js başlamadan, dosya açık değilken).
 * Bot nesnelerinin YALNIZ okuma yöntemleri çağrılır (bot.ozet, y.ozet); yazan yöntem (mutabakat, engelKaldir, guvenliKipKaldir, baslat …) YOK.
 */
'use strict';
const fs = require('fs');
const yollar = require('../yollar');
const guncelleme = require('../guncelleme');
const DOKTOR = require('../doktor');

const guvenli = (fn, vars = null) => { try { const x = fn(); return x === undefined ? vars : x; } catch { return vars; } };
const istGun = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);

function kur(ctx) {
  const { app, kok, APP_VERSION, ARASTIRMA_MODU, COMMIT } = ctx;

  function botGirdileri(simdi) {
    return ctx.BINDIRME_ADLAR.map(ad => ctx.bindirmeler[ad]).filter(b => b && b.bot).map(b => {
      let o;
      try { o = b.bot.ozet(simdi) || {}; } catch { return { ad: b.ad, adGorunen: b.bot.adGorunen || b.ad, mod: b.mod, okunamadi: true }; }
      const y = b.y && b.y.borsa ? (guvenli(() => b.y.ozet(), null) || {}) : { durum: 'BAGLI_DEGIL' };
      return { ad: b.ad, adGorunen: o.adGorunen || b.bot.adGorunen || b.ad, mod: o.mod || b.mod, calisiyor: !!o.calisiyor, engel: o.bindirmeEngel || o.kolEngel || null,
        guvenliKip: o.guvenliKip || null, yurutucu: { durum: y.durum || null, durmaTuru: y.durmaTuru || null, geriCekilme: y.geriCekilme || null },
        sonKarar: o.sonKarar ? { gun: o.sonKarar.gun, zaman: o.sonKarar.zaman } : null, kalpDurumu: o.kalpDurumu || null };
    });
  }
  function kilitler() {
    const l = [];
    const simdi = Date.now();
    const vk = guvenli(() => ctx.veriOrk.kilitDurumu(), undefined);
    if (vk === undefined) return null;
    if (vk) { const bas = Date.parse(vk.bas || ''); l.push({ ad: 'veri orkestratörü kilidi', bayat: !!vk.bayat, yasMs: Number.isFinite(bas) ? simdi - bas : null, sahip: vk.pid ? `süreç ${vk.pid}` : null }); }
    const gk = yollar.programVeri(kok, 'guncelleme.kilit');
    try {
      const st = fs.statSync(gk);
      const yas = simdi - st.mtimeMs;
      const d = guvenli(() => guncelleme.durumOku(kok), {}) || {};
      const suruyor = !!(d.islem && !d.islem.bitti);
      l.push({ ad: 'güncelleme kilidi', bayat: yas > DOKTOR.K.ESIK.kilitBayatMs && !suruyor, yasMs: yas, sahip: suruyor ? 'güncelleme sürüyor' : null });
    } catch { /* kilit yok */ }
    return l;
  }

  const DR = DOKTOR.olustur({
    rol: () => (ARASTIRMA_MODU ? 'arastirma' : 'sunucu'),
    kaynaklar: {
      sorunlar: () => (ARASTIRMA_MODU ? [] : (ctx.sorunlarHesapla() || {}).sorunlar || null),
      surec: () => ({ surum: APP_VERSION, commit: COMMIT, uptimeSn: process.uptime(), denetleyici: !!process.env.PUSULA_KONSOL_GUNLUGU && !ARASTIRMA_MODU }),
      oz: () => { const g = ctx.ozDenetim.goruntu(); return g && g.ozet ? { sonYoklama: g.ozet.sonYoklama || null } : null; },
      botlar: () => botGirdileri(Date.now()),
      olaylar: (bas) => {
        const O = ctx.olayAkisi && ctx.olayAkisi.OLAY;
        if (!O) return [];
        O.tazele();
        return O.oku({ bas: istGun(bas), bit: istGun(Date.now()), n: 1000 }).olaylar || [];
      },
      // Günlük dosyaları büyük olabilir: desen taraması en çok son 7 gün (onarım günlüğünün diğer kaynakları 30 güne kadar).
      gunluk: (saat) => (ctx.GUNLUK.oku({ saat: Math.min(saat, 7 * 24), limit: 5000 }).kayitlar || []),
      kilitler,
      botBul: (m) => guvenli(() => ctx.olayAkisi.botBul(m), null),
    },
  });

  app.get('/api/doktor', (req, res) => {
    // Kılavuz görüntüsü (scripts/kilavuz-ekran.js SORUN_ORNEK=1): ÖRNEK yanıt — gerçek veri değil (lib/doktor/ornek.js)
    if (process.env.SORUN_ORNEK === '1' && req.query && req.query.ornek === '1') {
      try { return res.json({ success: true, ...require('../doktor/ornek').yanit(Date.now(), Number(req.query.gun) || 7), zaman: Date.now() }); }
      catch (e) { return res.status(500).json({ success: false, error: String(e.message || e).slice(0, 300) }); }
    }
    try {
      const t = DR.teshis();
      res.json({ success: true, rol: ARASTIRMA_MODU ? 'arastirma' : 'sunucu', surum: APP_VERSION, ...t, hazir: DR.hazir(),
        onarim: DR.onarimlar(req.query && req.query.gun), onarimTurleri: DOKTOR.K.ONARIM_TURLERI, sinirlar: DOKTOR.K.SINIRLAR });
    } catch (e) { res.status(500).json({ success: false, error: String(e.message || e).slice(0, 300) }); }
  });
  app.get('/api/hazir', (req, res) => {
    try { res.json({ success: true, ...DR.hazir({ taze: !!(req.query && req.query.taze === '1') }) }); }
    catch (e) { res.status(500).json({ success: false, error: String(e.message || e).slice(0, 300) }); }
  });

  if (process.env.DOKTOR !== '0') {
    const tik = () => { try { const r = DR.bakimTik(); if (r && r.sayi) require('../database').addLog('INFO', `🩺 Pusula Doktoru: ${r.sayi} geçici tatbikat klasörü silindi (24 saatten eski)`); } catch { /* bakım işi hata verse de Pusula sürer */ } };
    const t1 = setTimeout(tik, 20 * 60 * 1000);
    const t2 = setInterval(tik, 60 * 60 * 1000);
    for (const t of [t1, t2]) if (t.unref) t.unref();
  }

  return { DOKTOR: DR };
}

module.exports = { kur };
