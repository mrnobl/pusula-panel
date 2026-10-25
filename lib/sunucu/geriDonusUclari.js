'use strict';
/**
 * D1 GERİ DÖNÜŞ TATBİKATI — sunucu bağdaştırıcısı (4. faz 4c; lib/tatbikat/geriDonus.js; TASARIM-MAKINE-HESAP-BOT §5.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *   POST /api/tatbikat/geri-donus  {}   tatbikatı şimdi başlatır (yalnız bu bilgisayardan; arka planda sürer — GET /api/tatbikat `geriDonus`
 *                                       alanı ilerlemeyi ve sonucu gösterir). Araştırma kopyasında 400, karar penceresinde / sürerken /
 *                                       eş kopyası çekilirken 409.
 * Zamanlayıcı: dakikada bir — ayın ilk pazarı 11:00 TR (TATBIKAT_GERI_DONUS=0 kapatır; araştırma kopyasında yok).
 * Kuru deneme koşucusu: scripts/kuru-deneme.js AYRI node sürecinde (lib/kuruDeneme.js ile aynı: sırsız ortam + ağ kalkanı; bu dosya
 * yalnız `process.execPath` ile node açar — kabuk / PowerShell / cmd yok, kapatırken yalnız kendi çocuğu, zaman aşımında execFile keser).
 * Hiçbir uç emir vermez, botu başlatmaz/durdurmaz, bot ayarına / bot dizinine / yedek klasörüne / eş kopyasına yazmaz.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../yollar');
const GD = require('../tatbikat/geriDonus');
const P = require('../tatbikat/provalar');

function kur(ctx, { dizin, sonucDosya, bildir, log }) {
  const { kok, ARASTIRMA_MODU } = ctx;
  const DURUM = path.join(dizin, GD.DURUM_AD);
  const guvenli = (f, v = null) => { try { return f(); } catch { return v; } };
  const BA = require('../botAdlari');
  const nobet = require('../makine/nobet');
  let is = null;   // { bas, kaynak, adim }
  let sonCalisanAy = null;   // durum dosyası yazılamasa da zamanlayıcı aynı ay yeniden koşmasın

  const durumOku = () => { try { return JSON.parse(fs.readFileSync(DURUM, 'utf8')); } catch { return null; } };
  const yedekHedef = () => {
    const a = guvenli(() => JSON.parse(fs.readFileSync(yollar.veri('yedek-ayar.json'), 'utf8')));
    return (a && a.hedef) || path.join(require('os').homedir(), 'PusulaYedek');   // scripts/yedek.js varsayılanı
  };
  const ben = () => guvenli(() => ctx.makine.KIMLIK.kimlik);
  const botlar = () => (guvenli(() => ctx.BINDIRME_ADLAR.map(ad => ctx.bindirmeler[ad]).filter(b => b && b.bot), []) || []).map(b => {
    const a = guvenli(() => ctx.bindirmeAyar(b.ad), {}) || {};
    const e = guvenli(() => nobet.yerelEngel({ kayit: ctx.BOT_KAYIT && ctx.BOT_KAYIT.kayit(b.ad), tasima: null, ben: ben() }));
    return { ad: b.ad, strateji: guvenli(() => b.bot.ayar.strateji) || b.ad, adGorunen: BA.ad(b.ad) || guvenli(() => b.bot.adGorunen) || b.ad, mod: b.mod, dizin: b.dizin,
      btcAyak: guvenli(() => b.bot.ayar.btcAyak), sermayeTavani: guvenli(() => b.bot.ayar.sermayeTavani), k: a.k, kagitBakiye: a.kagitBakiye, kucukSermaye: guvenli(() => b.bot.ayar.kucukSermaye),
      baskaMakinede: !!(e && e.kod === 'baska-makinede' && ben()) };
  });
  const esAd = (k) => guvenli(() => ((ctx.makineEslesme.liste().makineler || []).find(m => m.kimlik === k) || {}).ad) || null;
  const kopyaSuruyor = () => !!guvenli(() => ctx.makine.KOPYA.cekici.durum().suruyor);

  /** Kuru deneme koşucusu: ayrı node süreci (yalnız process.execPath). */
  const node = (args, o) => new Promise((coz) => {
    require('child_process').execFile(process.execPath, args, { cwd: kok, env: o.env, timeout: o.sure, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      coz({ kod: err ? (Number.isFinite(err.code) ? err.code : 1) : 0, cikti: `${stdout || ''}${stderr ? `\n${stderr}` : ''}` });
    });
  });

  /** Engel → null | { durum, kod, error }. */
  function engel(simdi = Date.now()) {
    if (ARASTIRMA_MODU) return { durum: 400, kod: 'arastirma', error: 'Bu bilgisayar araştırma kopyası — geri dönüş tatbikatı sunucuda çalışır.' };
    if (is) return { durum: 409, kod: 'suruyor', error: 'Geri dönüş tatbikatı zaten sürüyor — bitince sonucu bu sayfada görürsünüz.' };
    if (P.kararPenceresinde(simdi)) return { durum: 409, kod: 'karar-penceresi', error: 'Şu an botların günlük çalışma saati (02:30–04:00) — tatbikatı başka bir saatte çalıştırın.' };
    if (kopyaSuruyor()) return { durum: 409, kod: 'kopya-suruyor', error: 'Şu an eş kopyası çekiliyor — birkaç dakika sonra yeniden deneyin.' };
    return null;
  }

  async function calistir(kaynak = 'zamanlayici') {
    const e = engel();
    if (e) return { ok: false, ...e };
    is = { bas: Date.now(), kaynak, adim: 'başlıyor' };
    const benim = is;
    (async () => {
      let r;
      try {
        r = await GD.calistir({ kok, botlar: botlar(), yedekHedef: yedekHedef(), esKopya: yollar.veri('es-kopya'), esAd, ben: ben(),
          yedekSifre: () => require('../tasima').yedekSifre(), ops: { node }, ilerleme: (m) => { benim.adim = m; } });
        r.kaynak = kaynak;
      } catch (err) {
        r = { z: Date.now(), tur: 'geri-donus', ay: GD.ayAdi(Date.now()), kaynak, kaynaklar: [], genel: [{ kimlik: 'hata', ad: 'Tatbikat çalıştı', durum: 'kaldi', metin: String(err.message || err).slice(0, 300) }],
          sayilar: { gecti: 0, uyari: 0, kaldi: 1, atlandi: 0, bilgi: 0 }, hukum: 'geçmedi', sure: '—', sureMs: Date.now() - benim.bas };
      }
      try { fs.mkdirSync(dizin, { recursive: true }); fs.appendFileSync(sonucDosya, JSON.stringify(r) + '\n', 'utf8'); } catch (err) { log('WARN', `🧯 Geri dönüş tatbikatı sonucu yazılamadı: ${err.message}`); }
      try { fs.mkdirSync(dizin, { recursive: true }); const g = `${DURUM}.${process.pid}.tmp`; fs.writeFileSync(g, JSON.stringify(GD.ozetle(r))); fs.renameSync(g, DURUM); } catch { /* */ }
      log(r.sayilar.kaldi ? 'WARN' : 'INFO', `🧯 Geri dönüş tatbikatı (${kaynak}): ${r.sayilar.gecti} geçti · ${r.sayilar.uyari} uyarı · ${r.sayilar.kaldi} kaldı · ${r.sure}`);
      const t = GD.telegramMetni(r);
      try { await bildir(t.baslik, t.satirlar); } catch { /* bildirim tatbikatı bozmaz */ }
      sonCalisanAy = r.ay;
      is = null;
    })();
    return { ok: true, basladi: new Date(benim.bas).toISOString() };
  }

  /** GET /api/tatbikat `geriDonus` alanı. */
  function durum() {
    const o = durumOku();
    return { son: o, suruyor: is ? { bas: is.bas, kaynak: is.kaynak, adim: is.adim } : null, sonraki: ARASTIRMA_MODU ? null : GD.sonrakiZaman(Date.now(), o && o.sonAy),
      kapali: process.env.TATBIKAT_GERI_DONUS === '0', denetim: GD.denetimSonucu(o, Date.now(), { arastirma: !!ARASTIRMA_MODU }) };
  }

  if (!ARASTIRMA_MODU && process.env.TATBIKAT_GERI_DONUS !== '0') {
    const t = setInterval(() => {
      if (is) return;
      const o = durumOku();
      if (sonCalisanAy === GD.ayAdi(Date.now()) || !GD.zamaniGeldi(Date.now(), o && o.sonAy)) return;
      calistir('zamanlayici').then((r) => { if (!r.ok && r.kod !== 'suruyor') log('WARN', `🧯 Geri dönüş tatbikatı başlamadı: ${r.error}`); }).catch(e => log('WARN', `🧯 Geri dönüş tatbikatı: ${e.message}`));
    }, 60e3);
    if (t.unref) t.unref();
  }

  ctx.app.post('/api/tatbikat/geri-donus', async (req, res) => {
    try {
      const r = await calistir('elle');
      if (!r.ok) return res.status(r.durum || 400).json({ success: false, error: r.error, kod: r.kod || null });
      res.json({ success: true, basladi: r.basladi });
    } catch (e) { res.status(500).json({ success: false, error: String((e && e.message) || e).slice(0, 300) }); }
  });

  return { calistir, durum, son: durumOku, suruyor: () => !!is };
}

module.exports = { kur };
