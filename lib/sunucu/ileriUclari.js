/**
 * C1 (75.0, TASARIM-MAKINE-HESAP-BOT §3 parça 2) — server.js'ten taşındı, davranış AYNI. İLERİ TEST uçları:
 *   Bollinger ileri veri gölge izleyicisi (PLAN-ILERI-BOLLINGER; scripts/ileri-izle.js ALT SÜREÇTE, açılıştan 1 dk sonra + 5 dk'lık tik;
 *   gölge DUR → alarm, gerçek parada acil durdurma + ENGEL — PLAN-GERCEK-PARA-2027 §7),
 *   GET /api/ileri/kabul (demo kabul ara durumu + Hücum/Denge kontrol noktaları, SALT OKUMA), GET /api/ileri/bollinger.
 * Dönen { ileriIs, demoKabulOzet } veri orkestratörüne, sorun merkezine ve Telegram /ileri'ye ctx ile verilir.
 *
 * Bağlanma: server.js `ILERI_UCLARI = require('./lib/sunucu/ileriUclari').kur(ctx)` — eski yerinde (Express uç ve zamanlayıcı sırası aynı).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const db = require('../database');
const isletim = require('../live/isletim');

function kur(ctx) {
  const { app, kok, STRATEJI_ADLAR, botEtiketi, GOLGE_DOSYA, portfoyBildirici, bindirmeler } = ctx;
  // ── İLERİ VERİ GÖLGE İZLEYİCİ — Bollinger düşüş azaltıcı (PLAN-ILERI-BOLLINGER.md) ──
  /**
   * Emir YOK. Her gün 00:15 UTC sonrası ilk tikte ve açılışta bir kez `scripts/ileri-izle.js`
   * ALT SÜREÇTE koşar (kol modeli DCA backtest'i olay döngüsünü bloklamasın; çökme sunucuyu
   * etkilemesin). Kayıt yalnız eklenir (lib/ileri/bollingerIzleme.js); betikle aynı anda koşarsa
   * kilit dosyası sıraya sokar. Ağ hatasında 15 dk sonra yeniden dener; seri/gölge eksikse
   * aynı gün 30 dk arayla en çok 3 kez daha.
   */
  const ileriIzleme = require('../ileri/bollingerIzleme');
  const ileriRapor = require('../ileri/bollingerRapor');
  const zamanDilimiGolge = require('../ileri/zamanDilimiGolge');   // 3d gölge (PLAN-GOLGE-3D, 635) — ileri-izle.js içinde yazılır
  const rangeVetoGolge = require('../ileri/rangeVetoGolge');       // D3 range vetosu gölgesi (PLAN-GOLGE-D3, 764) — aynı betikte yazılır
  const ileriIs = { calisiyor: false, sonGun: null, gunDeneme: 0, sonDeneme: 0, sonHata: null, eksikVar: false };
  let ileriRaporOnbellek = null;
  const ileriDakika = (t) => { const d = new Date(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  function ileriCalistir(neden) {
    if (ileriIs.calisiyor) return;
    ileriIs.calisiyor = true; ileriIs.sonDeneme = Date.now();
    const bas = Date.now(), gun = new Date(bas).toISOString().slice(0, 10);
    const gunlukMu = ileriDakika(bas) >= 15;          // 00:00–00:15 arası açılış koşusu günlük işi saymaz
    require('child_process').execFile(process.execPath, [path.join(kok, 'scripts', 'ileri-izle.js'), '--json'],
      { cwd: kok, timeout: 15 * 60 * 1000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
        ileriIs.calisiyor = false;
        if (err) {
          ileriIs.sonHata = `${err.message.split('\n')[0]}${stderr ? ' · ' + String(stderr).trim().split('\n').slice(-1)[0] : ''}`;
          db.addLog('WARN', `[İLERİ] izleme çalışmadı (${neden}): ${ileriIs.sonHata} — 15 dk sonra yeniden denenecek`);
          return;
        }
        try {
          const o = JSON.parse(stdout);
          ileriIs.sonHata = null;
          if (gunlukMu) {
            if (ileriIs.sonGun !== gun) { ileriIs.sonGun = gun; ileriIs.gunDeneme = 0; }
            ileriIs.gunDeneme++;
            ileriIs.eksikVar = o.eksik.length > 0 || !!o.golgeHata;
          }
          ileriRaporOnbellek = null;
          db.addLog(o.eksik.length || o.golgeHata ? 'WARN' : 'INFO', `[İLERİ] Bollinger ileri kayıt (${neden}): +${o.yeniSatir} satır${o.gecikmeliSatir ? ` (${o.gecikmeliSatir} gecikmeli)` : ''}, gölge +${o.golgeYeni}, ${o.kaydedilenSeri}/37 seri${o.eksik.length ? ` · indirilemeyen: ${o.eksik.map(e => e.seri).join(', ')}` : ''}${o.golgeHata ? ` · gölge hatası: ${o.golgeHata}` : ''} (${(o.sureMs / 1000).toFixed(0)} sn)`);
          // PLAN-ILERI-HUCUM-DENGE A: gölge ileri MaxDD > p99 → "DUR" (yalnız gösterge + alarm; kural değişmez).
          const golge = isletim.golgeOku(GOLGE_DOSYA);
          for (const ad of STRATEJI_ADLAR) {   // 74.5: model gölgesi strateji başına (yeni botların kendi modeli yok)
            const md = isletim.golgeModelDurumu(golge, ad);
            if (md.durum === 'DUR' || md.durum === 'uyari') {
              db.addLog(md.durum === 'DUR' ? 'ERROR' : 'WARN', `[İLERİ] ${botEtiketi(ad)} gölge: ${md.metin}`);
              portfoyBildirici.gonder(md.durum === 'DUR' ? 'alarm' : 'uyari', `${botEtiketi(ad)} ileri veri: ${md.durum === 'DUR' ? 'DUR' : 'uyarı'}`, [md.metin], { anahtar: `model:${ad}:${md.durum}`, kisitMs: 24 * 3600e3 });
              // C1 (PLAN-GERCEK-PARA-2027 §7): gerçek parada ileri test DUR → acil durdurma + ENGEL (yeniden değerlendirme).
              const bc = bindirmeler[ad];
              if (md.durum === 'DUR' && bc && bc.mod === 'canli' && !(bc.bot.durum.engel || '').startsWith('ileri test DUR')) {
                const engelYaz = () => { bc.bot.durum.engel = `ileri test DUR — yeniden değerlendirme gerekli: ${md.metin}`; bc.bot._yaz(); };
                Promise.resolve(bc.y.borsa ? null : bc.bagla({ mutabakatsiz: true }))
                  .then(() => bc.bot.acilDurdur(`ileri test DUR: ${md.metin}`)).then(engelYaz)
                  .catch(e => { engelYaz(); portfoyBildirici.gonder('alarm', `${bc.bot.adGorunen}: DUR acil durdurması BAŞARISIZ`, [e.message, 'Binance arayüzünden elle kapatın (PLAN-GERCEK-PARA-2027 §7)']); });
              }
            }
          }
        } catch (e) { ileriIs.sonHata = `çıktı okunamadı: ${e.message}`; }
      });
  }
  function ileriTik() {
    if (ileriIs.calisiyor) return;
    const simdi = Date.now();
    const gun = new Date(simdi).toISOString().slice(0, 10);
    if (ileriDakika(simdi) < 15) return;
    if (ileriIs.sonGun !== gun) {
      if (ileriIs.sonHata && simdi - ileriIs.sonDeneme < 15 * 60 * 1000) return;
      return ileriCalistir('günlük');
    }
    if (ileriIs.eksikVar && ileriIs.gunDeneme < 4 && simdi - ileriIs.sonDeneme >= 30 * 60 * 1000) ileriCalistir('eksik tamamlama');
  }
  setTimeout(() => ileriCalistir('açılış'), 60 * 1000).unref();
  setInterval(ileriTik, 5 * 60 * 1000).unref();

  /**
   * İLERİ TEST › DEMO KABUL — ara durum (SALT OKUMA, Pusula P4). PLAN-DEMO-KABUL.md ölçütlerinin bugünkü
   * durumu (gün sayacı, aşama tarihleri, betimleyici getiri/MaxDD, 63 g bandı, uygulama bandı); HÜKÜM YAZMAZ.
   * Hücum/Denge gölge kontrol noktaları (90/182/365 g, PLAN-ILERI-HUCUM-DENGE A) da buradan.
   */
  const demoKabulOzet = require('../ileri/demoKabulOzet');
  app.get('/api/ileri/kabul', (req, res) => {
    try {
      const HD = require('../ileri/hucumDengeEsikleri');
      const ilk = '2026-10-07';   // ilk ileri gün (PLAN-ILERI-HUCUM-DENGE; gölge izleyicinin başlangıcı)
      const kontrol = HD.UFUKLAR.map(g => ({ gun: g, tarih: new Date(Date.parse(ilk + 'T00:00:00Z') + g * 864e5).toISOString().slice(0, 10) }));
      // Denetim A-17: Hücum-S (1000 $) dondurulmuş MaxDD eşikleri (deneme 861, karar Ö9 / G3b) — ayrı gölge yok, Hücum gölgesine uygulanır.
      const hucumS = { plan: HD.PLANLAR.hucumS, bantlar: HD.UFUKLAR.map(u => ({ ufuk: u, p95: HD.DAGILIM.hucumS[u].maxdd.p95, p99: HD.DAGILIM.hucumS[u].maxdd.p99 })) };
      res.json({ success: true, demo: demoKabulOzet.ozet(), hucumDenge: { ilk, kontrol, plan: HD.PLAN, hucumS } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/ileri/bollinger', (req, res) => {
    try {
      const F = ileriIzleme.dosyalar();
      const ZF = zamanDilimiGolge.dosyalar();
      const RF = rangeVetoGolge.dosyalar();
      const imza = [F.kayit, F.golge, ZF.kayit, RF.kayit].map(f => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0)).join('|') + '|' + new Date().toISOString().slice(0, 10);
      if (!ileriRaporOnbellek || ileriRaporOnbellek.imza !== imza) {
        const kayit = ileriIzleme.satirlariOku(F.kayit), golge = ileriIzleme.satirlariOku(F.golge);
        const h = ileriRapor.hukum(kayit);
        ileriRaporOnbellek = { imza, rapor: ileriRapor.araRapor(kayit, golge),
          hukum: { durum: h.durum, mesaj: h.mesaj || null, hukum: h.durum === 'hukum' ? h.hukum : null, tarih: h.tarih || null, sonrakiTarih: h.sonrakiTarih || null } };
        try { ileriRaporOnbellek.zamanDilimi = zamanDilimiGolge.panelOzet(ileriIzleme.satirlariOku(ZF.kayit), golge); } catch (e) { ileriRaporOnbellek.zamanDilimi = { hata: e.message }; }
        try { ileriRaporOnbellek.rangeVeto = rangeVetoGolge.panelOzet(ileriIzleme.satirlariOku(RF.kayit), golge); } catch (e) { ileriRaporOnbellek.rangeVeto = { hata: e.message }; }
      }
      let son = null;
      try { son = JSON.parse(fs.readFileSync(F.son, 'utf8')); } catch { /* henüz çalışmadı */ }
      res.json({ success: true, rapor: ileriRaporOnbellek.rapor, hukum: ileriRaporOnbellek.hukum, zamanDilimi: ileriRaporOnbellek.zamanDilimi || null, rangeVeto: ileriRaporOnbellek.rangeVeto || null,
        izleyici: { calisiyor: ileriIs.calisiyor, sonHata: ileriIs.sonHata,
          sonCalisma: son && { zaman: son.zaman, yeniSatir: son.yeniSatir, golgeYeni: son.golgeYeni, golgeHata: son.golgeHata, eksik: son.eksik } } });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  return { ileriIs, demoKabulOzet };
}

module.exports = { kur };
