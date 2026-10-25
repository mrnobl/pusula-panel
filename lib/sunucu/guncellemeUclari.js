/**
 * C1 (74.8, TASARIM-MAKINE-HESAP-BOT §3 parça 1) — server.js'ten taşındı, davranış AYNI.
 * OTOMATİK GÜNCELLEME (61.3; lib/guncelleme.js, scripts/guncelle.js, görev PusulaGuncelle 12:00). Panel: Ayarlar › Bu bilgisayar.
 *   GET  /api/guncelleme/durum    data/guncelleme.json + bu sunucunun sürümü (telefonda da okunur)
 *   POST /api/guncelleme/kontrol  güncelleyiciyi şimdi çalıştır (arka planda, ayrı süreç)
 *   POST /api/guncelleme/uygula {hedef}  bot kodu değişen güncellemeyi ONAYLA ve kur — yalnız bekleyen hedef commit
 *   POST /api/sistem/yeniden-baslat  temiz kapan (kod 75) → denetleyici 10 sn sonra yeni kodla açar; yalnız denetleyiciyle
 *        (Pusula kısayolu / PusulaBot görevi: PUSULA_KONSOL_GUNLUGU) başlatılmışsa — yoksa süreç geri gelmezdi.
 * POST'lar telefonda (lib/guvenlik.js beyaz liste) ve araştırma modunda (ARASTIRMA_KAPALI) 403.
 *
 * Bağlanma: server.js `GUNCELLEME_UCLARI.kur(ctx)` — eski yerinde (Express uç sırası aynı). ctx: lib/sunucu/baglam.js.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const yollar = require('../yollar');
const db = require('../database');
const guncelleme = require('../guncelleme');

/**
 * Y8 (61.8): botun günlük kararı UTC 00:02 (TR 03:02); veri indirmesi ve yeniden denemeler bu çevrede. Bu pencerede
 * (UTC 23:50–01:30) yeniden başlatma ve onaylı kurulum REDDEDİLİR — günlük çalışma emirlerin ortasında kesilmesin.
 */
function kararPenceresinde(simdi = Date.now()) {
  const d = new Date(simdi), dk = d.getUTCHours() * 60 + d.getUTCMinutes();
  return dk >= 23 * 60 + 50 || dk < 90;
}
const KARAR_PENCERESI_METNI = 'Botun günlük karar saati (TR 02:50–04:30) — bu aralıkta güncelleme kurulmaz ve Pusula yeniden başlatılmaz. 04:30\'dan sonra yeniden deneyin.';

function kur(ctx) {
  const { app, kok, APP_VERSION, ARASTIRMA_MODU, BINDIRME_ADLAR, bindirmeler, bindirmeAyar, shutdown } = ctx;
  function guncelleyiciBaslat(args) {
    require('child_process').spawn(process.execPath, [path.join(kok, 'scripts', 'guncelle.js'), ...args],
      { cwd: kok, detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
  /*
   * 75.3 B3 KADEMELİ GÜNCELLEME — yeniden deneme: durum 'kademe-bekliyor' iken 5 dk'da bir kapı (lib/makine/kademe.js, ctx.makine) yeniden
   * sorulur; açılınca güncelleyici çalıştırılır (onaylı bekleyen kurulum onayıyla). Karar penceresinde, kilit varken, araştırma
   * kopyasında çalışmaz. Durum başka bir şeyse hiçbir şey yapmaz (tek makinede durum hiç 'kademe-bekliyor' olmaz).
   */
  if (!ARASTIRMA_MODU && process.env.MAKINE_KADEME_TEKRAR !== '0') {
    const kademeTekrar = () => {
      try {
        const d = guncelleme.durumOku(kok);
        if (d.durum !== 'kademe-bekliyor' || !d.kademe || guncelleme.kilitVar(kok) || kararPenceresinde()) return;
        const k = ctx.makine.kademe(d.kademe.hedef);
        if (!k || !k.izin) return;
        db.addLog('INFO', `🔄 Kademeli güncelleme: sıra geldi (${k.neden}) — güncelleyici çalıştırılıyor`);
        guncelleyiciBaslat(d.kademe.onayli ? ['--onayla', d.kademe.hedef, ...(d.kademe.kuruFarkOnay ? ['--kuru-fark-onay'] : [])] : []);
      } catch (e) { /* makine modülü yok / okunamadı: sonraki tur */ }
    };
    const t = setInterval(kademeTekrar, 5 * 60 * 1000);
    if (t.unref) t.unref();
  }
  app.get('/api/guncelleme/durum', (req, res) => {
    const d = guncelleme.durumOku(kok);
    // 69.0: işlem bitmeden kilit kalkmışsa güncelleyici süreç yarıda ölmüş — panel "sürüyor" deyip sonsuza dek beklemesin.
    if (d.islem && !d.islem.bitti && !guncelleme.kilitVar(kok)) d.islem = { ...d.islem, yarida: true };
    res.json({ success: true, ...d, adimTanim: guncelleme.ADIMLAR, calisanSurum: APP_VERSION, gelistirme: ARASTIRMA_MODU, denetleyici: !!process.env.PUSULA_KONSOL_GUNLUGU });
  });
  app.post('/api/guncelleme/kontrol', (req, res) => {
    guncelleyiciBaslat([]);
    res.status(202).json({ success: true, basladi: true });
  });
  app.post('/api/guncelleme/uygula', (req, res) => {
    if (kararPenceresinde()) return res.status(409).json({ success: false, error: KARAR_PENCERESI_METNI });
    const d = guncelleme.durumOku(kok);
    const hedef = String((req.body && req.body.hedef) || '');
    if (d.durum !== 'onay' || !d.hedef || hedef !== d.hedef) return res.status(409).json({ success: false, error: 'Onay bekleyen bu güncelleme artık yok (yeni sürüm gelmiş ya da kurulmuş olabilir). Sayfayı yenileyin.' });
    // 69.2: kuru denemede karar farkı çıktıysa kurulum ancak "Farkı gördüm, yine de kur" ile (aynı commit için) sürer.
    const farkOnay = !!(req.body && req.body.kuruFarkOnay) && !!(d.kuruFark && d.kuruFark.hedef === d.hedef);
    guncelleyiciBaslat(['--onayla', d.hedef, ...(farkOnay ? ['--kuru-fark-onay'] : [])]);
    res.status(202).json({ success: true, basladi: true, kuruFarkOnay: farkOnay });
  });
  /** 69.2 KURU DENEME: güncelleyicinin (scripts/guncelle.js) bot listesi — yalnız bu bilgisayardan (yollar sunucu içi bilgi). */
  app.get('/api/guncelleme/kuru-bilgi', (req, res) => {
    if ((req.kademe || 'yerel') !== 'yerel') return res.status(403).json({ success: false, error: 'yalnız sunucunun kendisinden' });
    res.json({ success: true, botlar: BINDIRME_ADLAR.map(ad => bindirmeler[ad]).filter(Boolean).map(b => {
      const a = bindirmeAyar(b.ad);
      return { ad: b.ad, strateji: b.bot.ayar.strateji || b.ad, adGorunen: b.bot.adGorunen, mod: b.mod, dizin: b.dizin, btcAyak: b.bot.ayar.btcAyak, sermayeTavani: b.bot.ayar.sermayeTavani,
        k: a.k, kagitBakiye: a.kagitBakiye, kucukSermaye: b.bot.ayar.kucukSermaye, calisiyor: !!b.bot.durum.calisiyor };
    }) });
  });
  app.post('/api/sistem/yeniden-baslat', (req, res) => {
    if (!process.env.PUSULA_KONSOL_GUNLUGU) return res.status(409).json({ success: false, error: 'Pusula denetleyiciyle (kısayol / PusulaBot görevi) başlatılmamış: kapanırsa geri açılmaz.' });
    if (kararPenceresinde()) return res.status(409).json({ success: false, error: KARAR_PENCERESI_METNI });
    res.status(202).json({ success: true });
    db.addLog('INFO', '🔄 Güncelleme: sunucu yeniden başlatılıyor (denetleyici 10 sn sonra açar)');
    setTimeout(() => shutdown('güncelleme sonrası yeniden başlatma', 75), 300);
  });
  /**
   * 73.6 (S01): POST /api/sistem/durdur — güncelleyicinin paket kurulumu için Pusula'yı DURDURMASI (eskiden arka planda
   * `powershell -ExecutionPolicy Bypass -File pusula-sunucu.ps1 -Islem Durdur` açılıyordu; antivirüs tetikleyicisi).
   * Pusula-Durdur'un yaptığının aynısı, PowerShell'siz: "bilerek durduruldu" işareti (bekçi açmasın; içerikte "guncelleme pid=…"
   * — güncelleyici yarıda ölürse nöbetçisi bu işareti tanıyıp Pusula'yı yeniden açar, S04), PID kaydı silinir (PusulaBot
   * görevi "kendiliğinden kapandı" sanıp yeniden denemesin), sonra temiz kapanış (çıkış 0 → denetleyici de kapanır).
   * Yalnız denetleyiciyle başlatılmışsa ve karar penceresi dışında; yerel PIN kapısının arkasında (betik sistem jetonuyla geçer).
   */
  app.post('/api/sistem/durdur', (req, res) => {
    if (!process.env.PUSULA_KONSOL_GUNLUGU) return res.status(409).json({ success: false, error: 'Pusula denetleyiciyle (kısayol / PusulaBot görevi) başlatılmamış: bu yoldan durdurulmaz.' });
    if (kararPenceresinde()) return res.status(409).json({ success: false, error: KARAR_PENCERESI_METNI });
    const pid = Math.max(0, parseInt((req.body && req.body.pid) || 0, 10) || 0);
    try { fs.writeFileSync(yollar.veri('pusula-durduruldu.txt'), `guncelleme pid=${pid} ${new Date().toISOString()}\r\n`, 'ascii'); }
    catch (e) { return res.status(500).json({ success: false, error: `durdurma işareti yazılamadı: ${e.message}` }); }
    try { fs.unlinkSync(yollar.veri('pusula.pid')); } catch (e) { /* yok */ }
    res.status(202).json({ success: true });
    db.addLog('INFO', '⏸️ Güncelleme: paket kurulumu için Pusula durduruluyor (güncelleyici bitince yeniden açar)');
    setTimeout(() => shutdown('güncelleme: paket kurulumu için durdurma', 0), 300);
  });
}

module.exports = { kur, kararPenceresinde, KARAR_PENCERESI_METNI };
