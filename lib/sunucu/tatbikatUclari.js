'use strict';
/**
 * D3 TATBİKAT uçları (TASARIM-MAKINE-HESAP-BOT §8.4; panel Sistem › Tatbikatlar — public/js/pages/tatbikat.js)
 * ═══════════════════════════════════════════════════════════════════════════
 *   GET  /api/tatbikat                 prova listesi + her bot için önkoşullar, süren tatbikat (adımlar, doğrulamalar, önerilen hüküm),
 *                                      geçmiş (sonuclar.jsonl), Kairos demo kabul provalarının durumu, otomatik tatbikatın son/sonraki zamanı
 *   POST /api/tatbikat/baslat  { prova, bot }       önkoşullar geçmeli; aynı anda tek tatbikat
 *   POST /api/tatbikat/adim    { id, sembol? }      kullanıcının "yaptım" adımı (sırayla)
 *   POST /api/tatbikat/kaydet  { hukum, not? }      sonucu yazar (demo kabul provası → prova-gunlugu.json; YEREL PIN — lib/yerelPin.js)
 *   POST /api/tatbikat/iptal   { neden? }           prova günlüğüne yazmadan bırakır
 *   POST /api/tatbikat/otomatik {}                  aylık otomatik denetimi şimdi çalıştırır (salt okuma)
 * POST uçları yalnız bu bilgisayardan (telefon kademesi yalnız GET; geliştirme kademesine eklenmedi). Araştırma kopyasında başlatılamaz.
 * Zamanlayıcı: süren tatbikat varken 30 sn'de bir tik (açılıştan 15 sn sonra da — yeniden açılışı kaydeder); dakikada bir otomatik
 * tatbikat zamanı (ayın ilk pazarı 11:30 TR; TATBIKAT_OTOMATIK=0 kapatır). Hiçbir uç emir vermez, bot ayarı değiştirmez, süreç kapatmaz.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const SH = require('../tatbikat/sihirbaz');
const OT = require('../tatbikat/otomatik');

function kur(ctx) {
  const { app, ARASTIRMA_MODU } = ctx;
  const db = require('../database');
  const log = (lv, msg) => { try { db.addLog(lv, msg); } catch { console.log(msg); } };
  const BA = require('../botAdlari');
  const nobet = require('../makine/nobet');
  const DIZIN = yollar.veri('tatbikat');
  const OTO_DOSYA = path.join(DIZIN, 'otomatik.json');
  const ACILIS = Date.now() - Math.round(process.uptime() * 1000);
  const guvenli = (f, v = null) => { try { return f(); } catch { return v; } };

  const benKimlik = () => guvenli(() => ctx.makine.KIMLIK.kimlik);
  const botlarHam = () => guvenli(() => ctx.BINDIRME_ADLAR.map(ad => ctx.bindirmeler[ad]).filter(b => b && b.bot), []) || [];
  const kayitEngel = (ad) => guvenli(() => nobet.yerelEngel({ kayit: ctx.BOT_KAYIT && ctx.BOT_KAYIT.kayit(ad), tasima: null, ben: benKimlik() }));
  const botlar = () => (ARASTIRMA_MODU ? [] : botlarHam().map(b => ({
    ad: b.ad, adGorunen: BA.ad(b.ad) || guvenli(() => b.bot.adGorunen) || b.ad, mod: b.mod || guvenli(() => b.bot.ayar.mod), dizin: b.dizin || guvenli(() => b.bot.ayar.dizin),
    ozet: () => b.bot.ozet(),
    kayitEngel: () => kayitEngel(b.ad),
    tasinabilir: () => nobet.tasinabilirMi({ kimlik: b.ad, motor: 'bindirme', mod: b.mod, demoDizinDolu: b.ad === 'hucum' && guvenli(() => fs.readdirSync(yollar.veri('live', 'hucum-demo')).length > 0, false) }),
  })));

  async function bildir(baslik, satirlar) {
    if (ARASTIRMA_MODU) return null;
    const engel = guvenli(() => (ctx.makine && typeof ctx.makine.telegramEngeli === 'function' ? ctx.makine.telegramEngeli() : null));
    if (engel) return null;   // Telegram'ı başka makine dinliyor — sonuç panelde ve olay akışında
    const pb = guvenli(() => ctx.portfoyBildirici);
    if (!pb || typeof pb.gonder !== 'function') return null;
    return pb.gonder('tatbikat', baslik, satirlar);
  }

  const SIH = SH.olustur({
    dizin: DIZIN, log, bildir, arastirma: ARASTIRMA_MODU,
    kaynaklar: {
      botlar,
      ozDenetim: () => { const o = ctx.ozDenetim; return o ? { dizin: o.dizin || yollar.veri('oz-denetim'), kesintiBas: (o.kayit && o.kayit.kesintiBas) || null } : null; },
      acilis: () => ACILIS,
      bildirimGecmis: yollar.programVeri(ctx.kok, 'bildirim-gecmis.jsonl'),
      supervisorDosya: yollar.veri('supervisor.log'),
      demoGun: (ad) => { if (ad !== 'hucum') return null; const d = ctx.demoKabulOzet && ctx.demoKabulOzet.ozet(); return d && Number.isFinite(d.gecenGun) ? d.gecenGun : null; },
      makineVar: () => ((ctx.makineEslesme.liste().makineler || []).length > 0),
    },
  });

  // ── Aylık otomatik denetim (salt okuma) ──
  const otoOku = () => { try { return JSON.parse(fs.readFileSync(OTO_DOSYA, 'utf8')); } catch { return {}; } };
  async function otomatikCalistir(kaynak = 'zamanlayici') {
    const simdi = Date.now();
    const ben = benKimlik();
    const girdi = botlarHam().map(b => {
      const dz = b.dizin || guvenli(() => b.bot.ayar.dizin);
      const e = kayitEngel(b.ad);
      return { ad: b.ad, adGorunen: BA.ad(b.ad) || b.ad, mod: b.mod, ozet: guvenli(() => b.bot.ozet()),
        mutabakat: dz ? SH.jsonlSon(path.join(dz, 'mutabakat.jsonl'), 256 * 1024) : [], koruma: dz ? SH.jsonlSon(path.join(dz, 'koruma.jsonl'), 256 * 1024) : [],
        acil: dz ? SH.jsonlSon(path.join(dz, 'alarmlar.jsonl'), 512 * 1024).filter(x => x.olay === 'acil-deneme') : [], baskaMakinede: !!(e && e.kod === 'baska-makinede' && ben) };
    });
    const r = { ...OT.calistir({ botlar: girdi, simdi }), kaynak };
    try { fs.mkdirSync(DIZIN, { recursive: true }); fs.appendFileSync(SIH.SONUC, JSON.stringify(r) + '\n', 'utf8'); } catch (e) { log('WARN', `🧯 Otomatik tatbikat sonucu yazılamadı: ${e.message}`); }
    try { fs.mkdirSync(DIZIN, { recursive: true }); const g = `${OTO_DOSYA}.${process.pid}.tmp`; fs.writeFileSync(g, JSON.stringify({ sonAy: r.ay, son: simdi, hukum: r.hukum, sayilar: r.sayilar })); fs.renameSync(g, OTO_DOSYA); } catch { /* */ }
    log(r.sayilar.kaldi ? 'WARN' : 'INFO', `🧯 Aylık otomatik tatbikat (${kaynak}): ${r.sayilar.gecti} geçti · ${r.sayilar.uyari} uyarı · ${r.sayilar.kaldi} kaldı`);
    const t = OT.telegramMetni(r);
    try { await bildir(t.baslik, t.satirlar); } catch { /* */ }
    return r;
  }
  function sonrakiOtomatik(simdi = Date.now()) {
    const TR = 3 * 3600e3;
    for (let g = 0; g < 70; g++) {
      const d = new Date(simdi + TR + g * 864e5);
      if (d.getUTCDay() !== 0 || d.getUTCDate() > 7) continue;
      const z = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 11, 30) - TR;
      if (z >= simdi - 864e5 && OT.ayAdi(z) !== otoOku().sonAy) return Math.max(z, simdi);
    }
    return null;
  }

  // ── Zamanlayıcılar (unref; araştırma kopyasında yok) ──
  if (!ARASTIRMA_MODU) {
    const t1 = setTimeout(() => { try { SIH.tik(); } catch (e) { log('WARN', `🧯 Tatbikat: ${e.message}`); } }, 15e3);
    const t2 = setInterval(() => { if (SIH.etkinVar()) { try { SIH.tik(); } catch (e) { log('WARN', `🧯 Tatbikat: ${e.message}`); } } }, SH.NABIZ_MS);
    const zamanlar = [t1, t2];
    if (process.env.TATBIKAT_OTOMATIK !== '0') {
      let calisiyor = false;
      zamanlar.push(setInterval(() => {
        if (calisiyor || !OT.zamaniGeldi(Date.now(), otoOku().sonAy)) return;
        calisiyor = true;
        otomatikCalistir('zamanlayici').catch(e => log('WARN', `🧯 Otomatik tatbikat: ${e.message}`)).finally(() => { calisiyor = false; });
      }, 60e3));
    }
    for (const t of zamanlar) if (t.unref) t.unref();
  }

  const hata = (res, e) => res.status(500).json({ success: false, error: String((e && e.message) || e).slice(0, 300) });
  const cevap = (res, r) => (r.ok ? res.json({ success: true, ...r }) : res.status(r.kod === 'suruyor' ? 409 : 400).json({ success: false, error: r.hata, kod: r.kod || null, onkosul: r.onkosul || undefined }));

  app.get('/api/tatbikat', (req, res) => {
    try {
      const o = otoOku();
      res.json({ success: true, ...SIH.durum(), otomatik: { son: o.son || null, sonAy: o.sonAy || null, hukum: o.hukum || null, sayilar: o.sayilar || null, sonraki: ARASTIRMA_MODU ? null : sonrakiOtomatik(), kapali: process.env.TATBIKAT_OTOMATIK === '0' } });
    } catch (e) { hata(res, e); }
  });
  app.post('/api/tatbikat/baslat', (req, res) => { try { const b = req.body || {}; cevap(res, SIH.baslat({ prova: String(b.prova || ''), bot: String(b.bot || '') })); } catch (e) { hata(res, e); } });
  app.post('/api/tatbikat/adim', (req, res) => { try { const b = req.body || {}; cevap(res, SIH.adim({ id: String(b.id || ''), sembol: b.sembol ? String(b.sembol) : null })); } catch (e) { hata(res, e); } });
  app.post('/api/tatbikat/kaydet', async (req, res) => { try { const b = req.body || {}; cevap(res, await SIH.kaydet({ hukum: String(b.hukum || ''), not: b.not ? String(b.not) : '' })); } catch (e) { hata(res, e); } });
  app.post('/api/tatbikat/iptal', (req, res) => { try { const b = req.body || {}; cevap(res, SIH.iptal({ neden: b.neden ? String(b.neden) : '' })); } catch (e) { hata(res, e); } });
  app.post('/api/tatbikat/otomatik', async (req, res) => {
    try {
      if (ARASTIRMA_MODU) return res.status(400).json({ success: false, error: 'Bu bilgisayar araştırma kopyası — otomatik tatbikat sunucuda çalışır.' });
      res.json({ success: true, sonuc: await otomatikCalistir('elle') });
    } catch (e) { hata(res, e); }
  });

  return { SIH, otomatikCalistir, sonrakiOtomatik };
}

module.exports = { kur };
